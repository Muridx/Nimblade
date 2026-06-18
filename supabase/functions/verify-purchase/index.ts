/**
 * NIMBLADE — Verify Purchase Edge Function
 *
 * Verifies a NIM→gems purchase on-chain before crediting gems.
 * Replaces the old client-callable buy_gems_credit RPC.
 *
 * Flow:
 *   1. Client pays NIM via wallet (Nimiq Pay / Hub) → gets txHash
 *   2. Client calls this Edge Function with { tx_hash, wallet_addr }
 *   3. Edge Function queries Nimiq RPC to verify tx exists on-chain
 *   4. Validates: recipient = PURCHASE_WALLET, value > 0, confirmed
 *   5. Credits gems via buy_gems_credit (service_role, not anon)
 *
 * Required Supabase secrets:
 *   NIMIQ_PURCHASE_WALLET — NQ address where gem purchases go (your dev wallet)
 *   NIMIQ_RPC_URL         — Nimiq node RPC endpoint (optional, defaults to rpc.nimiqwatch.com)
 *
 * Expects POST body: { tx_hash: string, wallet_addr: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LUNA_PER_NIM = 100_000;

// --- Main handler ---------------------------------------------------------

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { tx_hash, wallet_addr } = await req.json();

    if (!tx_hash || typeof tx_hash !== "string" || tx_hash.length < 16) {
      return jsonResp({ ok: false, error: "invalid_tx_hash" }, 400);
    }
    if (
      !wallet_addr ||
      typeof wallet_addr !== "string" ||
      wallet_addr.length < 5
    ) {
      return jsonResp({ ok: false, error: "invalid_wallet_addr" }, 400);
    }

    // --- Config ---
    const PURCHASE_WALLET = Deno.env.get("NIMIQ_PURCHASE_WALLET");
    const RPC_URL =
      Deno.env.get("NIMIQ_RPC_URL") || "https://rpc.nimiqwatch.com";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!PURCHASE_WALLET) {
      console.error("[verify-purchase] NIMIQ_PURCHASE_WALLET not set");
      return jsonResp(
        { ok: false, error: "purchase_wallet_not_configured" },
        500
      );
    }

    // Normalize: remove spaces, uppercase
    const normalizedPurchaseWallet = PURCHASE_WALLET.replace(/[\s-]/g, "").toUpperCase();

    // --- 1. Query Nimiq RPC for the transaction ---
    let txData: any;
    try {
      txData = await fetchTxWithRetry(RPC_URL, tx_hash, 3, 2000);
    } catch (e) {
      return jsonResp(
        {
          ok: false,
          error: "tx_not_found",
          detail: e.message,
        },
        404
      );
    }

    // --- 2. Validate transaction ---
    // Check recipient matches purchase wallet
    const txTo = (txData.to || "").replace(/[\s-]/g, "").toUpperCase();
    if (txTo !== normalizedPurchaseWallet) {
      return jsonResp(
        {
          ok: false,
          error: "wrong_recipient",
          detail: `Transaction recipient ${txData.to} does not match purchase wallet`,
        },
        400
      );
    }

    // Check execution was successful
    if (txData.executionResult === false) {
      return jsonResp(
        { ok: false, error: "tx_failed", detail: "Transaction execution failed" },
        400
      );
    }

    // Check confirmations (require at least 1)
    const confirmations = txData.confirmations || 0;
    if (confirmations < 1) {
      return jsonResp(
        {
          ok: false,
          error: "tx_unconfirmed",
          detail: "Transaction has 0 confirmations, try again shortly",
        },
        400
      );
    }

    // Get value in NIM
    const valueLuna = Number(txData.value || 0);
    if (valueLuna <= 0) {
      return jsonResp(
        { ok: false, error: "zero_value", detail: "Transaction has no value" },
        400
      );
    }
    const nimAmount = valueLuna / LUNA_PER_NIM;

    // --- 3. Credit gems via service_role ---
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: creditResult, error: creditError } = await sb.rpc(
      "buy_gems_credit",
      {
        p_wallet: wallet_addr,
        p_nim: nimAmount,
        p_tx_hash: tx_hash,
      }
    );

    if (creditError) {
      console.error("[verify-purchase] RPC error:", creditError);
      return jsonResp(
        { ok: false, error: "credit_failed", detail: creditError.message },
        500
      );
    }

    if (!creditResult?.ok) {
      // Likely tx_already_credited (idempotent) or other validation error
      return jsonResp(creditResult || { ok: false, error: "unknown" }, 400);
    }

    return jsonResp({
      ok: true,
      gems_credited: creditResult.gems_credited,
      nim_paid: nimAmount,
      tx_hash: tx_hash,
      confirmations: confirmations,
    });
  } catch (e) {
    console.error("[verify-purchase] Unhandled error:", e);
    return jsonResp({ ok: false, error: "internal_error" }, 500);
  }
});

// --- Helpers ---------------------------------------------------------------

/**
 * Fetch transaction from Nimiq RPC with retries (tx may not be indexed yet).
 */
async function fetchTxWithRetry(
  rpcUrl: string,
  txHash: string,
  maxRetries: number,
  delayMs: number
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rpcRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "getTransactionByHash",
          params: [txHash],
          id: 1,
        }),
      });

      const rpcData = await rpcRes.json();

      if (rpcData.error) {
        // "Transaction not found" → retry
        if (
          rpcData.error.data &&
          /not found/i.test(String(rpcData.error.data))
        ) {
          if (attempt < maxRetries) {
            await sleep(delayMs);
            continue;
          }
          throw new Error(`Transaction not found after ${maxRetries} retries`);
        }
        throw new Error(rpcData.error.message || JSON.stringify(rpcData.error));
      }

      // Handle { result: { data: {...} } } format
      const raw = rpcData.result;
      const tx =
        typeof raw === "object" && raw !== null && "data" in raw
          ? raw.data
          : raw;

      if (!tx || typeof tx !== "object") {
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        throw new Error("Empty transaction data");
      }

      return tx;
    } catch (e) {
      if (attempt < maxRetries && /not found|timeout|fetch/i.test(e.message)) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Transaction lookup failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
