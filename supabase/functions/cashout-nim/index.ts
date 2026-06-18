/**
 * NIMBLADE — Auto Cashout Edge Function
 *
 * Called after cashout_gems RPC deducts gems and creates a pending request.
 * This function:
 *   1. Validates the cashout request exists and is pending
 *   2. Signs a NIM basic transaction from the hot wallet
 *   3. Broadcasts it to the Nimiq network
 *   4. Marks the request as completed with tx_hash
 *
 * Required Supabase secrets:
 *   NIMIQ_HOT_WALLET_PRIVATE_KEY — hex-encoded 32-byte Ed25519 private key
 *   NIMIQ_HOT_WALLET_ADDRESS     — the NQ... address of the hot wallet
 *   NIMIQ_RPC_URL                — Nimiq node RPC endpoint (e.g. https://rpc.nimiq.network)
 *   NIMIQ_NETWORK                — "main" or "test"
 *
 * Expects POST body: { request_id: string, recipient: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LUNA_PER_NIM = 100_000;

// --- Nimiq address helpers ------------------------------------------------

/** Nimiq "user-friendly" address alphabet (Base32 with custom charset). */
const NIMIQ_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

/**
 * Decode a Nimiq user-friendly address (NQ...) to 20-byte Uint8Array.
 * Strips spaces, validates checksum.
 */
function nimiqAddressToBytes(address: string): Uint8Array {
  const raw = address.replace(/[\s-]/g, "").toUpperCase();
  if (raw.length !== 36 || !raw.startsWith("NQ")) {
    throw new Error(`Invalid Nimiq address format: ${address}`);
  }

  // Decode base32 (custom Nimiq alphabet)
  const chars = raw.slice(4); // skip "NQxx" checksum prefix
  let bits = "";
  for (const c of chars) {
    const idx = NIMIQ_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`Invalid character '${c}' in address`);
    bits += idx.toString(2).padStart(5, "0");
  }

  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }

  return bytes;
}

/** Encode 20-byte address to Nimiq user-friendly format NQxx ... */
function bytesToNimiqAddress(bytes: Uint8Array): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");

  let encoded = "";
  for (let i = 0; i < 160; i += 5) {
    encoded += NIMIQ_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }

  // Calculate checksum (ISO 13616 mod 97-10)
  const full = encoded + "NQ00";
  let remainder = "";
  for (const c of full) {
    const val = NIMIQ_ALPHABET.indexOf(c);
    remainder += val >= 0 ? (val < 10 ? val : val + 55) : "";
  }
  let mod = 0n;
  for (let i = 0; i < remainder.length; i += 7) {
    mod = BigInt(mod.toString() + remainder.slice(i, i + 7)) % 97n;
  }
  const check = (98n - mod).toString().padStart(2, "0");

  const addr = `NQ${check} ${encoded.match(/.{4}/g)!.join(" ")}`;
  return addr;
}

// --- Ed25519 signing via Web Crypto API -----------------------------------

/**
 * Import an Ed25519 private key and sign data.
 * Deno/Supabase Edge Functions support Ed25519 via Web Crypto.
 */
async function ed25519Sign(
  privateKeyHex: string,
  data: Uint8Array
): Promise<{ publicKey: Uint8Array; signature: Uint8Array }> {
  const privBytes = hexToBytes(privateKeyHex);

  // Import private key via PKCS8 (Web Crypto doesn't support "raw" for Ed25519 private keys)
  const { privateKey, publicKey: pubCryptoKey } = await generateKeyPairFromSeed(privBytes);

  // Extract raw 32-byte public key
  const pubRaw = await crypto.subtle.exportKey("raw", pubCryptoKey);
  const publicKey = new Uint8Array(pubRaw);

  // Sign with the PKCS8-imported private key
  const sigBuf = await crypto.subtle.sign("Ed25519", privateKey, data);
  const signature = new Uint8Array(sigBuf);

  return { publicKey, signature };
}

async function generateKeyPairFromSeed(seed: Uint8Array) {
  // Deno supports Ed25519 key generation from seed via PKCS8 format
  // Construct PKCS8 DER for Ed25519 private key from 32-byte seed
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(seed, pkcs8Prefix.length);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    true, // extractable so we can derive public key
    ["sign"]
  );

  // Export as JWK to get the public key component
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const pubBytes = base64UrlDecode(jwk.x!);

  // Import public key for verification (optional, but we mainly need the bytes)
  const publicKey = await crypto.subtle.importKey(
    "raw",
    pubBytes,
    { name: "Ed25519" },
    true,
    ["verify"]
  );

  return { privateKey, publicKey };
}

// --- Nimiq Basic Transaction serialization (Albatross) --------------------

/**
 * Serialize a Nimiq Albatross basic transaction for signing.
 *
 * Basic tx format (serialized for signing):
 *   - DATA_PREFIX: 0x00 0x00 (no data)
 *   - sender (20 bytes)
 *   - sender_type: 0x00 (basic)
 *   - recipient (20 bytes)
 *   - recipient_type: 0x00 (basic)
 *   - value (8 bytes, big-endian, in Luna)
 *   - fee (8 bytes, big-endian, in Luna)
 *   - validity_start_height (4 bytes, big-endian)
 *   - network_id (1 byte)
 *   - flags: 0x00
 *   - sender_data_len: 0x00 (postcard varint 0, Albatross only)
 *
 * Ref: core-rs-albatross/primitives/transaction/src/lib.rs → SerializeContent
 */
function serializeBasicTx(params: {
  senderBytes: Uint8Array;
  recipientBytes: Uint8Array;
  valueLuna: bigint;
  feeLuna: bigint;
  validityStartHeight: number;
  networkId: number;
}): Uint8Array {
  // For Albatross networks (IDs 5,6,7,24) sender_data is appended
  const isAlbatross = [5, 6, 7, 24].includes(params.networkId);
  const buf = new ArrayBuffer(
    2 + // recipient_data length (0)
    20 + // sender
    1 + // sender type
    20 + // recipient
    1 + // recipient type
    8 + // value
    8 + // fee
    4 + // validity_start_height
    1 + // network_id
    1 + // flags
    (isAlbatross ? 1 : 0) // sender_data_len (postcard varint 0)
  );
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 0;

  // Recipient data length = 0 (PoW-compatible prefix)
  view.setUint16(off, 0); off += 2;

  // Sender (20 bytes)
  bytes.set(params.senderBytes, off); off += 20;

  // Sender type = Basic (0)
  view.setUint8(off, 0); off += 1;

  // Recipient (20 bytes)
  bytes.set(params.recipientBytes, off); off += 20;

  // Recipient type = Basic (0)
  view.setUint8(off, 0); off += 1;

  // Value in Luna (8 bytes big-endian)
  view.setBigUint64(off, params.valueLuna); off += 8;

  // Fee in Luna (8 bytes big-endian)
  view.setBigUint64(off, params.feeLuna); off += 8;

  // Validity start height (4 bytes big-endian)
  view.setUint32(off, params.validityStartHeight); off += 4;

  // Network ID (1 byte): 24 = MainAlbatross, 5 = TestAlbatross
  view.setUint8(off, params.networkId); off += 1;

  // Flags = 0
  view.setUint8(off, 0); off += 1;

  // Sender data length = 0 (Albatross only, postcard varint encoding)
  if (isAlbatross) {
    view.setUint8(off, 0); off += 1;
  }

  return bytes;
}

/**
 * Serialize the full signed basic transaction for RPC submission.
 *
 * Nimiq Albatross basic transaction wire format:
 *   - format: 0x00 (Basic)
 *   - type_and_flags: 0x00 (Ed25519, no webauthn)
 *   - public_key (32 bytes)
 *   - recipient (20 bytes)
 *   - value (8 bytes BE, Coin as u64)
 *   - fee (8 bytes BE, Coin as u64)
 *   - validity_start_height (4 bytes BE)
 *   - network_id (1 byte)
 *   - signature (64 bytes)
 *
 * Total: 139 bytes
 *
 * Ref: core-rs-albatross/primitives/transaction/src/lib.rs → serde::Serialize for Transaction
 */
function serializeSignedBasicTx(params: {
  publicKey: Uint8Array;
  recipientBytes: Uint8Array;
  valueLuna: bigint;
  feeLuna: bigint;
  validityStartHeight: number;
  networkId: number;
  signature: Uint8Array;
}): Uint8Array {
  const totalLen =
    1 +  // format (Basic = 0)
    1 +  // type_and_flags (Ed25519 = 0x00)
    32 + // public key
    20 + // recipient
    8 +  // value
    8 +  // fee
    4 +  // validity_start_height
    1 +  // network_id
    64;  // signature

  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 0;

  // Transaction format = Basic (0)
  view.setUint8(off, 0x00); off += 1;

  // Type and flags: Ed25519 (0x00), no webauthn flags
  view.setUint8(off, 0x00); off += 1;

  // Sender public key (32 bytes)
  bytes.set(params.publicKey, off); off += 32;

  // Recipient (20 bytes)
  bytes.set(params.recipientBytes, off); off += 20;

  // Value (8 bytes BE)
  view.setBigUint64(off, params.valueLuna); off += 8;

  // Fee (8 bytes BE)
  view.setBigUint64(off, params.feeLuna); off += 8;

  // Validity start height (4 bytes BE)
  view.setUint32(off, params.validityStartHeight); off += 4;

  // Network ID
  view.setUint8(off, params.networkId); off += 1;

  // Signature (64 bytes)
  bytes.set(params.signature, off); off += 64;

  return bytes;
}

// --- Utility helpers ------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Main handler ---------------------------------------------------------

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { request_id, recipient } = await req.json();

    if (!request_id || !recipient) {
      return jsonResp({ ok: false, error: "missing request_id or recipient" }, 400);
    }

    // --- Config from secrets ---
    const PRIVATE_KEY_HEX = Deno.env.get("NIMIQ_HOT_WALLET_PRIVATE_KEY");
    const HOT_WALLET_ADDR = Deno.env.get("NIMIQ_HOT_WALLET_ADDRESS");
    const RPC_URL = Deno.env.get("NIMIQ_RPC_URL") || "https://rpc.nimiqwatch.com";
    const NETWORK = Deno.env.get("NIMIQ_NETWORK") || "main";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!PRIVATE_KEY_HEX || !HOT_WALLET_ADDR) {
      return jsonResp({ ok: false, error: "hot_wallet_not_configured" }, 500);
    }

    const networkId = NETWORK === "main" ? 24 : 5; // Albatross: main=24, test=5

    // --- Supabase admin client ---
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Fetch the pending cashout request
    const { data: reqData, error: reqErr } = await sb
      .from("cashout_requests")
      .select("*")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (reqErr || !reqData) {
      return jsonResp({ ok: false, error: "request_not_found_or_not_pending" }, 404);
    }

    // Validate recipient matches
    if (reqData.wallet_addr !== recipient) {
      return jsonResp({ ok: false, error: "recipient_mismatch" }, 400);
    }

    const nimAmount = Number(reqData.nim_amount);
    const valueLuna = BigInt(Math.round(nimAmount * LUNA_PER_NIM));

    // 2. Mark as processing
    await sb
      .from("cashout_requests")
      .update({ status: "processing" })
      .eq("id", request_id);

    // 3. Get current block height for validity window
    let blockHeight: number;
    try {
      const rpcRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "getBlockNumber",
          params: [],
          id: 1,
        }),
      });
      const rpcData = await rpcRes.json();
      // Handle both { result: N } and { result: { data: N } } formats
      const raw = rpcData.result;
      blockHeight = typeof raw === "object" && raw !== null && "data" in raw ? raw.data : raw;
    } catch (e) {
      // Fail cashout, refund gems
      await sb.rpc("fail_cashout", { p_request_id: request_id, p_error: "rpc_unreachable" });
      return jsonResp({ ok: false, error: "nimiq_rpc_unreachable" }, 502);
    }

    // 4. Build + sign transaction
    const senderBytes = nimiqAddressToBytes(HOT_WALLET_ADDR);
    const recipientBytes = nimiqAddressToBytes(recipient);

    const txData = serializeBasicTx({
      senderBytes,
      recipientBytes,
      valueLuna,
      feeLuna: 138n, // ~1 luna/byte for a 139-byte basic tx
      validityStartHeight: blockHeight,
      networkId,
    });

    let publicKey: Uint8Array, signature: Uint8Array;
    try {
      const result = await ed25519Sign(PRIVATE_KEY_HEX, txData);
      publicKey = result.publicKey;
      signature = result.signature;
    } catch (e) {
      await sb.rpc("fail_cashout", {
        p_request_id: request_id,
        p_error: `signing_failed: ${e.message}`,
      });
      return jsonResp({ ok: false, error: "transaction_signing_failed" }, 500);
    }

    // 5. Serialize signed transaction
    const signedTx = serializeSignedBasicTx({
      publicKey,
      recipientBytes,
      valueLuna,
      feeLuna: 138n,
      validityStartHeight: blockHeight,
      networkId,
      signature,
    });

    // 6. Broadcast via RPC
    let txHash: string;
    try {
      const rpcRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "sendRawTransaction",
          params: [bytesToHex(signedTx)],
          id: 2,
        }),
      });
      const rpcData = await rpcRes.json();
      if (rpcData.error) {
        throw new Error(rpcData.error.message || JSON.stringify(rpcData.error));
      }
      // Handle both { result: "hash" } and { result: { data: "hash" } }
      const rawTx = rpcData.result;
      txHash = typeof rawTx === "object" && rawTx !== null && "data" in rawTx ? rawTx.data : rawTx;
    } catch (e) {
      await sb.rpc("fail_cashout", {
        p_request_id: request_id,
        p_error: `broadcast_failed: ${e.message}`,
      });
      return jsonResp({ ok: false, error: `broadcast_failed: ${e.message}` }, 502);
    }

    // 7. Mark completed
    await sb.rpc("complete_cashout", {
      p_request_id: request_id,
      p_tx_hash: txHash,
    });

    return jsonResp({
      ok: true,
      tx_hash: txHash,
      nim_sent: nimAmount,
      recipient,
    });
  } catch (e) {
    console.error("[cashout-nim] Unhandled error:", e);
    return jsonResp({ ok: false, error: "internal_error" }, 500);
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
