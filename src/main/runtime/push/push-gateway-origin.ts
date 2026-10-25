import { cleanCloudServiceOrigin } from '../../../shared/cloud-service-url'
import { PRODUCT_BRAND } from '../../../shared/product-brand'

/** '' means no push gateway: without the product's own, devices are never registered elsewhere. */
export function resolvePushGatewayOrigin(env: NodeJS.ProcessEnv, packaged: boolean): string {
  return (
    cleanCloudServiceOrigin(env.ASTER_PUSH_GATEWAY_URL, !packaged) ??
    PRODUCT_BRAND.links.pushGateway ??
    ''
  )
}
