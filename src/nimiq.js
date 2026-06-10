// ─── NIMIQ MINI-APP SDK WRAPPER ──────────────────────────────────────────────
// Thin wrapper around @nimiq/mini-app-sdk for Nimblade.
//
// Public API:
//   connectWallet()         → wallet address (string) or null
//   getConnectedAddress()   → currently cached address, or null
//   disconnectWallet()      → clear cached provider + address
//   payNim({ amountNim, recipient, purpose }) → tx hash on success, throws on fail
//   getDeviceId(reason)     → stable 64-hex per-device id, or null (Practice tier)
//   NIMBLADE_RECIPIENT      → dev wallet that receives all in-game NIM payments
//
// IMPORTANT:
//   • Transaction values are in LUNA, not NIM. 1 NIM = 100,000 Luna.
//   • The SDK only works inside the Nimiq Pay app; in a plain browser
//     init() will reject after a 10-second timeout. That's expected for dev.

// Cached provider promise so we don't re-init on every call.
let providerPromise = null
// Cached current wallet address (filled by connectWallet).
let connectedAddress = null

// Lazy-init the Nimiq provider. Resolves with the NimiqProvider, or throws
// if not running inside Nimiq Pay (10s timeout).
async function getProvider() {
  if (!providerPromise) {
    providerPromise = (async () => {
      const { init } = await import('@nimiq/mini-app-sdk')
      return await init()
    })()
  }
  return providerPromise
}

/**
 * Connect to the user's Nimiq wallet via Nimiq Pay.
 * @returns {Promise<string|null>} NQ-format address, or null on failure.
 */
export async function connectWallet() {
  try {
    const nimiq = await getProvider()
    const accounts = await nimiq.listAccounts()

    // SDK can return { error: {...} } instead of throwing.
    if (accounts && accounts.error) {
      console.error('Nimiq listAccounts error:', accounts.error)
      return null
    }
    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.error('Nimiq: no accounts returned')
      return null
    }

    // listAccounts() returns string[] — each entry is the NQ address itself.
    connectedAddress = accounts[0]
    return connectedAddress
  } catch (e) {
    console.error('Nimiq connect failed:', e)
    return null
  }
}

/** Returns the currently connected address (or null if not connected). */
export function getConnectedAddress() {
  return connectedAddress
}

/** Clear cached wallet state. Next connectWallet() call will re-init. */
export function disconnectWallet() {
  connectedAddress = null
  providerPromise = null
}

/**
 * Send a NIM payment to the developer wallet for an in-game purchase.
 *
 * @param {object} opts
 * @param {number} opts.amountNim  amount in NIM (e.g. 5 for Sharpen Stone)
 * @param {string} opts.recipient  NQ-format recipient address
 * @param {string} [opts.purpose]  short purchase label (logged client-side)
 * @returns {Promise<string>} transaction hash on success
 * @throws if the user rejects, the SDK errors, or args are invalid
 */
export async function payNim({ amountNim, recipient, purpose }) {
  if (!amountNim || amountNim <= 0) throw new Error('Invalid NIM amount')
  if (!recipient) throw new Error('Missing recipient address')

  const nimiq = await getProvider()
  // 1 NIM = 100,000 Luna
  const valueLuna = Math.round(amountNim * 100_000)

  console.log(`[Nimiq] Paying ${amountNim} NIM (${valueLuna} Luna) for "${purpose}" → ${recipient}`)

  const result = await nimiq.sendBasicTransaction({
    recipient,
    value: valueLuna,
  })

  // Result is either tx hash (string) or { error: {...} }.
  if (typeof result === 'string') return result
  if (result && result.error) {
    throw new Error(result.error.message || 'Payment failed')
  }
  throw new Error('Unexpected payment response from wallet')
}

/**
 * Request a stable per-device identifier from Nimiq Pay.
 * Used for the Practice-tier leaderboard (no wallet required).
 * On first call per origin the user is prompted with `reason`.
 *
 * @param {string} [reason]
 * @returns {Promise<string|null>} 64-hex SHA-256, or null if unavailable.
 */
export async function getDeviceId(reason = 'Practice leaderboard ranking') {
  try {
    const { requestDeviceIdentifier } = await import('@nimiq/mini-app-sdk')
    return await requestDeviceIdentifier({ reason })
  } catch (e) {
    console.error('getDeviceId failed:', e)
    return null
  }
}

// Developer's NIM receiving wallet — destination for all in-game NIM payments.
export const NIMBLADE_RECIPIENT = 'NQ35 BMRD H1CX 91AY 7XKE EAXU HNH6 1906 S9DX'