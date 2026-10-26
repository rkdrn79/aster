# Slack 연결

Aster는 허용한 Slack 채널에서 봇을 **실제로 멘션한 메시지**를 연결한 프로젝트의 백그라운드 코디네이터 대화로 보냅니다. 코디네이터가 기존 에이전트에게 묻거나 새 작업자를 시작하고, 확인된 답을 원래 Slack 스레드에 남깁니다. Slack 메시지 자체가 실험 실행 승인이나 셸 명령 승인으로 바뀌지는 않습니다.

## Slack 앱 만들기

1. [Slack 앱 설정](https://api.slack.com/apps)에서 앱을 만들고 **Settings → Socket Mode**를 켭니다.
2. **Settings → Basic Information → App-Level Tokens**에서 `connections:write` 권한을 가진 `xapp-` 토큰을 만듭니다. 앱 목록 화면의 **App Configuration Tokens**는 매니페스트 관리용이고 12시간 뒤 만료되므로 Aster에 넣지 않습니다. [Socket Mode 설명](https://docs.slack.dev/apis/events-api/using-socket-mode/)과 [설정 토큰 설명](https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/)을 참고하세요.
3. **Features → Event Subscriptions**에서 이벤트를 켜고 봇 이벤트 `app_mention`을 구독합니다.
4. **Features → OAuth & Permissions → Bot Token Scopes**에 `app_mentions:read`, `chat:write`를 추가합니다. 오프라인 동안의 멘션을 나중에 확인하려면 공개 채널에 `channels:history`, 비공개 채널에 `groups:history`도 추가합니다. [Slack 기록 API](https://docs.slack.dev/reference/methods/conversations.history/)는 해당 기록 권한을 요구합니다.
5. 앱을 워크스페이스에 설치하거나 다시 설치합니다. **OAuth & Permissions**의 `xoxb-` Bot User OAuth Token을 복사하고 사용할 채널에 봇을 초대합니다.

## Aster에서 프로젝트 연결

1. 프로젝트의 **⋯ → Slack connection…**을 엽니다. 원격 프로젝트에는 이 컴퓨터에서 연결 가능한 Aster runtime 페어링이 필요합니다.
2. `xapp-`와 `xoxb-` 토큰, 허용할 채널 ID(`C…` 또는 `G…`), 사용자 ID(`U…` 또는 `W…`)를 입력합니다. 사용자에 `*`를 쓰면 선택한 채널의 모든 구성원이 봇을 부를 수 있습니다. 코디네이터 에이전트를 고르고 **Save connection**을 누릅니다.
3. Slack에서 `@aster-사용자이름`을 Slack의 멘션 선택기로 골라 메시지를 보냅니다. 이름을 일반 문자로만 적으면 Aster가 받지 않습니다. 답은 같은 스레드에 달립니다.
4. 앱을 닫아도 받으려면 **Keep Slack connected when Aster is closed**를 켭니다. Aster가 사용자 서비스로 Slack bridge와 필요한 경우 백그라운드 runtime을 설치합니다. VIP처럼 앱 소유 SSH 터널을 쓰는 프로젝트는 이 설정을 사용할 수 없습니다. 독립적으로 도달 가능한 원격 runtime은 서비스에서 연결할 수 있습니다. 설치된 macOS/Linux 앱에서 사용할 수 있고 Windows 백그라운드 서비스는 아직 지원하지 않습니다.

설정 화면은 현재 연결 주체가 앱인지 백그라운드 서비스인지 표시합니다. 컴퓨터가 잠들거나 인터넷이 끊기면 재연결 후 최근 24시간과 채널당 최대 200개 메시지, 제한된 스레드 답글을 확인합니다. **처음 추가한 채널의 과거 메시지는 처리하지 않습니다.** 기록 권한이 없으면 뒤늦은 확인을 건너뛰고 누락 권한을 표시합니다. 연결이 끊길 때 이미 진행 중이던 답변을 재시작 후 반드시 다시 게시하는 것은 아직 보장하지 않습니다.

토큰은 프로젝트/Git에 저장하지 않습니다. 앱은 로컬 보호 저장소를 쓰고, 백그라운드 서비스는 macOS 로그인 Keychain 또는 Linux 프로필의 소유자 전용 파일을 씁니다. 토큰을 바꿀 때 채널과 허용 사용자 설정도 다시 확인하세요.

### VIP 원격 프로젝트의 연결 수명

연결 기록은 원격 환경·확인한 runtime과 호스트 공개키·정확한 workspace ID를 저장합니다. Mac의 단일 Slack Socket Mode bridge가 해당 원격 runtime으로 코디네이터 요청을 보내며, VIP의 경로를 Mac 경로로 해석하거나 Slack 토큰을 VIP에 전달하지 않습니다. 호스트 정체성이 바뀌면 프로젝트를 다시 연결해야 합니다. **VIP처럼 SSH 터널로 연결된 프로젝트는 Aster 앱이 열려 있을 때만** Slack 요청을 처리할 수 있습니다. 이 상태에서는 백그라운드 Slack 서비스를 켤 수 없고, 서비스가 켜져 있으면 VIP route를 추가할 수 없습니다. 앱을 닫은 뒤에도 터널을 유지하는 서비스는 아직 없습니다. 아래의 호스트 측 CLI bridge는 별도 대안이지만, 같은 봇 토큰을 데스크톱 bridge와 동시에 쓰면 안 됩니다.

## 서버에서 CLI로 실행

서버의 같은 사용자 계정에 Aster, 프로젝트, 에이전트 CLI 로그인을 준비합니다. Socket Mode는 서버에서 Slack으로 나가는 연결이므로 공개 수신 URL은 필요하지 않습니다.

```sh
aster serve service install
aster serve service status

# 토큰은 현재 셸의 비밀 저장소에서 읽어 넣고 Git이나 서비스 파일에 쓰지 않습니다.
export SLACK_APP_TOKEN='xapp-…'
export SLACK_BOT_TOKEN='xoxb-…'
aster slack service install --worktree 'path:/absolute/project' \
  --agent codex --allowed-users '*' --allowed-channels C123ABC456
aster slack service status
unset SLACK_APP_TOKEN SLACK_BOT_TOKEN
```

`aster slack service install --dry-run`은 설치 없이 서비스 파일을 확인합니다. 토큰은 서비스 파일에 들어가지 않습니다. `aster slack service uninstall`은 bridge와 저장된 토큰을 제거하며 runtime 서비스 제거는 별도입니다. Linux에서는 로그아웃 후에도 서비스를 유지하려면 user lingering 설정이 필요할 수 있습니다. 데스크톱 앱의 프로젝트 메뉴가 서버에 이 서비스를 설치하거나 토큰을 전송하지는 않습니다. 같은 봇 토큰을 서로 다른 컴퓨터/프로필에서 동시에 사용하지 마세요. 로컬 연결 lease끼리는 서로 조정할 수 없습니다.

Slack 승인, 첨부 파일, 일반 문자 별칭, 셸 명령은 bridge의 입력 기능이 아닙니다. 실제 Slack 워크스페이스·에이전트 로그인·원격 서버가 준비됐는지는 별도 실연결 검증이 필요합니다.
