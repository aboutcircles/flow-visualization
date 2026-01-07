import { http, createConfig } from 'wagmi'
import { gnosis } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// WalletConnect project ID - you can get one at https://cloud.walletconnect.com
// NOTE: This is optional - injected wallets (like MetaMask) will work without it
// Only needed if you want to support WalletConnect QR code scanning
const projectId = 'YOUR_PROJECT_ID_HERE'

// Create connectors array
const createConnectors = () => {
  const connectorsList = []
  
  // Add Rabby if detected
  if (typeof window !== 'undefined' && window.rabby) {
    connectorsList.push(
      injected({
        target: {
          id: 'rabby',
          name: 'Rabby Wallet',
          provider: window.rabby,
        },
      })
    )
  }
  
  // Add MetaMask if detected (checking window.ethereum.providers for multi-wallet support)
  if (typeof window !== 'undefined') {
    // Check if there are multiple providers (Rabby + MetaMask scenario)
    if (window.ethereum?.providers) {
      const metaMaskProvider = window.ethereum.providers.find(
        (p) => p.isMetaMask && !p.isRabby
      )
      if (metaMaskProvider) {
        connectorsList.push(
          injected({
            target: {
              id: 'metaMask',
              name: 'MetaMask',
              provider: metaMaskProvider,
            },
          })
        )
      }
    } else if (window.ethereum?.isMetaMask && !window.ethereum?.isRabby) {
      // Single provider scenario - MetaMask only
      connectorsList.push(
        injected({
          target: {
            id: 'metaMask',
            name: 'MetaMask',
            provider: window.ethereum,
          },
        })
      )
    }
  }
  
  // Fallback: generic injected connector if no specific wallets detected
  if (connectorsList.length === 0) {
    connectorsList.push(injected())
  }
  
  // Always add WalletConnect
  connectorsList.push(
    walletConnect({ 
      projectId,
      showQrModal: true,
    })
  )
  
  return connectorsList
}

export const config = createConfig({
  chains: [gnosis],
  connectors: createConnectors(),
  transports: {
    [gnosis.id]: http(),
  },
})

// Hub contract address on Gnosis Chain
export const HUB_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8'