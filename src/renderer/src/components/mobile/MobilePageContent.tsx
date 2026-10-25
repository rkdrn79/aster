import type { MobileNetworkInterface } from '../settings/mobile-network-interface-selection'
import { HeroFlow, HeroIntro, HeroPaired, type PairedDevice, type StepIndex } from './MobileHero'
import type { MobilePageStage } from './mobile-page-stage'
import { MobilePageToolbar } from './MobilePageToolbar'
import type { MobilePairingConnectionMode } from '../../../../shared/mobile-pairing-connection-mode'
import type { MobileRelayMintFailure } from '../../../../shared/mobile-relay-mint-failure'

type MobilePageContentProps = {
  closeMobilePage: () => void
  copyPairingCode: () => void
  devices: readonly PairedDevice[]
  enterFlow: () => void
  generatePairing: (rotate: boolean) => void
  canGeneratePairing: boolean
  handleAddressChange: (address: string) => void
  customAddresses: readonly string[]
  selectedAddressIsCustom: boolean
  onCustomAddressSelect: (address: string) => void
  onCustomAddressRemove: (address: string) => void
  beforeCustomAddressChange: (address: string) => Promise<boolean>
  handleBack: () => void
  handleContinue: () => void
  loadNetworkInterfaces: () => void
  networkInterfaces: MobileNetworkInterface[]
  pairAnotherDevice: () => void
  pairLoading: boolean
  connectionMode: MobilePairingConnectionMode
  handleConnectionModeChange: (mode: MobilePairingConnectionMode) => void
  pairQrDataUrl: string | null
  pairQrSize: number | null
  pairingUrl: string | null
  pairingQrError: boolean
  relayMintFailure: MobileRelayMintFailure | null
  onUseLan: () => void
  onRetryRelay: () => void
  onCopyRelayDiagnostics: () => void
  refreshingNetworkInterfaces: boolean
  revokeDevice: (id: string) => void
  revokingDeviceIds: readonly string[]
  selectedAddress: string | undefined
  showMobileButton: boolean
  showPairedDevices: (deviceCount: number) => void
  stage: MobilePageStage | null
  stepIdx: StepIndex
  toggleMobileSidebarButton: () => void
}

export function MobilePageContent({
  closeMobilePage,
  copyPairingCode,
  devices,
  enterFlow,
  generatePairing,
  canGeneratePairing,
  handleAddressChange,
  customAddresses,
  selectedAddressIsCustom,
  onCustomAddressSelect,
  onCustomAddressRemove,
  beforeCustomAddressChange,
  handleBack,
  handleContinue,
  loadNetworkInterfaces,
  networkInterfaces,
  pairAnotherDevice,
  pairLoading,
  connectionMode,
  handleConnectionModeChange,
  pairQrDataUrl,
  pairQrSize,
  pairingUrl,
  pairingQrError,
  relayMintFailure,
  onUseLan,
  onRetryRelay,
  onCopyRelayDiagnostics,
  refreshingNetworkInterfaces,
  revokeDevice,
  revokingDeviceIds,
  selectedAddress,
  showMobileButton,
  showPairedDevices,
  stage,
  stepIdx,
  toggleMobileSidebarButton
}: MobilePageContentProps): React.JSX.Element {
  return (
    <div className="mobile-page-root scrollbar-sleek">
      <MobilePageToolbar
        showMobileButton={showMobileButton}
        onClose={closeMobilePage}
        onToggleMobileSidebarButton={toggleMobileSidebarButton}
      />
      <section className="mp-hero">
        <div className="mp-hero-copy">
          {stage === null ? null : stage === 'intro' ? (
            <HeroIntro onStart={enterFlow} />
          ) : stage === 'paired' ? (
            <HeroPaired
              devices={devices}
              onPairAnother={pairAnotherDevice}
              onRevoke={(id) => revokeDevice(id)}
              revokingDeviceIds={revokingDeviceIds}
            />
          ) : (
            <HeroFlow
              stepIdx={stepIdx}
              pairQrDataUrl={pairQrDataUrl}
              pairQrSize={pairQrSize}
              pairingUrl={pairingUrl}
              pairingQrError={pairingQrError}
              relayMintFailure={relayMintFailure}
              onUseLan={onUseLan}
              onRetryRelay={onRetryRelay}
              onCopyRelayDiagnostics={onCopyRelayDiagnostics}
              pairLoading={pairLoading}
              connectionMode={connectionMode}
              onConnectionModeChange={handleConnectionModeChange}
              onRegeneratePairing={() => generatePairing(true)}
              canGeneratePairing={canGeneratePairing}
              onCopyPairingCode={copyPairingCode}
              networkInterfaces={networkInterfaces}
              customAddresses={customAddresses}
              selectedAddress={selectedAddress}
              selectedAddressIsCustom={selectedAddressIsCustom}
              onSelectedAddressChange={handleAddressChange}
              onCustomAddressSelect={onCustomAddressSelect}
              onCustomAddressRemove={onCustomAddressRemove}
              beforeCustomAddressChange={beforeCustomAddressChange}
              onRefreshNetworkInterfaces={loadNetworkInterfaces}
              refreshingNetworkInterfaces={refreshingNetworkInterfaces}
              onBack={handleBack}
              onContinue={handleContinue}
              onDone={devices.length > 0 ? () => showPairedDevices(devices.length) : undefined}
            />
          )}
        </div>
      </section>
    </div>
  )
}
