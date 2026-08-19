/**
 * 웹 푸시용 VAPID 키 한 쌍을 만든다.
 *
 * 공개키는 브라우저에 나가고(공개돼도 안전), 비밀키는 발송기만 갖는다.
 * 비밀키가 새면 누구나 이 앱 이름으로 알림을 보낼 수 있으므로
 * 화면에 찍지 않고 .env.local 에만 쓴다. (.env.local 은 gitignore 대상)
 *
 *   npm run push:keys
 */
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

// JWK 로 뽑으면 좌표(x, y)와 비밀값(d)을 그대로 얻는다
const jwk = privateKey.export({ format: 'jwk' }) as { x: string; y: string; d: string }
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

// VAPID 공개키는 비압축 점 형식(0x04 + X + Y) 65바이트다
const pub = b64url(Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)]))
const priv = jwk.d

// 발송기가 서명할 때 PEM 이 필요하다. 한 줄로 넣기 위해 개행을 \n 으로 접는다
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

const ENV = '.env.local'
if (!existsSync(ENV)) {
  console.error(`${ENV} 이 없습니다. 먼저 만들어 주세요.`)
  process.exit(1)
}

let text = readFileSync(ENV, 'utf8')
if (/^VAPID_PRIVATE_KEY=/m.test(text)) {
  console.error('이미 VAPID 키가 있습니다. 다시 만들면 기존 구독이 전부 무효가 됩니다.')
  console.error('정말 새로 만들려면 .env.local 에서 VAPID_* 줄을 지우고 다시 실행하세요.')
  process.exit(1)
}

if (!text.endsWith('\n')) text += '\n'
text += [
  '',
  '# 웹 푸시 (VAPID). 공개키만 브라우저로 나간다.',
  `VITE_VAPID_PUBLIC_KEY=${pub}`,
  `VAPID_PRIVATE_KEY=${priv}`,
  `VAPID_PRIVATE_PEM=${JSON.stringify(pem)}`,
  '',
].join('\n')
writeFileSync(ENV, text, 'utf8')

console.log('VAPID 키를 .env.local 에 저장했습니다.')
console.log(`공개키(공개돼도 안전): ${pub}`)
console.log('비밀키는 화면에 찍지 않았습니다. .env.local 에서 확인하세요.')
