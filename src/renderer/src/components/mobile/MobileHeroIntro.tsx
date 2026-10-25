import { ArrowRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { PRODUCT_NAME } from '../../../../shared/product-brand'

export function HeroIntro({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <div className="mp-intro-shell">
      <div className="mp-eyebrow-row">
        <span className="mp-eyebrow">{PRODUCT_NAME} Mobile</span>
      </div>
      <h1 className="mp-h1">
        {translate(
          'auto.components.mobile.MobileHero.cd4e5e816f',
          'Your workspaces, in your pocket.'
        )}
      </h1>
      <p className="mp-lead">
        {PRODUCT_NAME} mobile and hosted access are in development. Local pairing is available for
        compatible phone clients on the same network or VPN.
      </p>
      <div className="mp-cta-row">
        <button
          type="button"
          className="mp-primary-action mp-flow-primary-action"
          onClick={onStart}
        >
          {translate('auto.components.mobile.MobileHero.10d27b4cba', 'Get started')}
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
