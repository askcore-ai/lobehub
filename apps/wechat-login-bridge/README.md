# AskCore WeChat Login Bridge

## Review-readiness correction after 1.0.0

The first review opened the mini-program without a website transaction and
received `链接已失效`. Direct entry now shows usage/privacy guidance and an
explicit action to copy the public website address; it does not request a
WeChat code or pretend the user is authorized. Invalid supplied transactions
still fail closed. A fresh website-issued Scheme request can display its confirm
button, and only server `state=authorized` produces normal-flow success. Rebind
success means proof submitted, not a new browser login or an account merge.

The approved prepublication entry adds a separate, initially disabled manual
proof button on the welcome page. It requires a valid 20-character hexadecimal
code personally created by the signed-in user on AskCore's isolated
`/api/auth/wechat-prepublication` document, reached from `/wechat-rebind`.
After explicit confirmation, real `wx.login` plus this code is sent only to
`/api/auth/wechat-prepublication/prove`. Only `state=proof_ready` displays
"授权验证已提交". This checks provider exchange, not historical identity match;
it creates no login session, account association or migration/rebind claim.
Return manually to the initiating browser and acknowledge the result there.
Code expiry is five minutes. Do not share, copy, persist, capture or record it.
Input is cleared on submission, hide/unload and a new Scheme launch. Check the
browser after a network failure before re-entering a still-valid code.

These native changes require another upload (proposed **1.0.1**); do not
resubmit the old 1.0.0 artifact. This is an entry repair, not proof of a usable
online login. First deploy the approved server release, then verify actual
WeChat requests and record the real process. No simulated success or
review-only authentication bypass is allowed.

The platform rejection allows usable test credentials or complete real
function screenshots/recording. Developer Preview can use the functional page
and fresh query before initial publication, but live capabilities must not be
saved in project configuration, copied into review text, or shown in footage.
The parameter handoff must first satisfy P148's secret-custody contract.
Release A can prove identity only; label that recording accurately. Complete
Safari/Chrome login requires Release B plus publication/identity gates and a
separate real-device run. Review support is not a guarantee of approval.

Official references: [restricted-access rejection criteria](https://developers.weixin.qq.com/miniprogram/product/reject.html),
[custom-condition device preview](https://developers.weixin.qq.com/miniprogram/dev/devtools/different.html),
and [review screenshots/video](https://developers.weixin.qq.com/doc/oplatform/openApi/OpenApiDoc/miniprogram-management/code-management/submitAudit.html).

This directory is the complete native mini-program uploaded for P148. It is a
private login bridge, not a public product surface. It requests no avatar,
nickname, phone, location, or profile scope. The only provider call is
`wx.login`; the only AskCore payload is the one-time WeChat code plus the
server-issued transaction and completion capability (normal flows), or the
dedicated acceptance-only manual code (prepublication proof).

## Required platform configuration

Before upload, use a **non-personal-entity** mini-program and bind it to the
same WeChat Open Platform account as AskCore's website application. In WeChat
Developer Tools, import this directory and select the real mini-program AppID.
The tool writes the non-secret AppID and shared compiler settings to
`project.config.json`; per-machine preferences in `project.private.config.json`
are ignored by Git. Preserve the uploaded project's AppID. Never put AppSecret
in either project file: it must exist only in the
server's ignored `.env/lobehub.secret` as
`AUTH_WECHAT_MINI_PROGRAM_SECRET`.

Configure and verify all of the following before publication:

- request domain: `https://askcore.cn`;
- page path: `pages/login/index`;
- privacy purpose: login identity confirmation only;
- “明文 Scheme 拉起此小程序” enabled for the published release;
- name search disabled and no public marketing entry;
- website application and mini-program display the same Open Platform owner.

Preview, development upload, and experience versions are useful for controller
testing, but an external Safari/Chrome Scheme launch requires a published
release. The browser cannot be forced back to its original tab; after the
success screen, the user returns with iOS/Android system navigation.

## Upload sequence

1. Import this directory in WeChat Developer Tools with the real AppID.
2. Compile normally in the simulator with an empty query. Verify welcome,
   disabled empty/invalid manual input and cleanup, using no real credential.
   Do not use phone debugging or put live Scheme values in compile settings.
3. Click **Upload**, enter a version and description, then select the uploaded
   development version in the platform console.
4. Set an ordinary experience version and confirm privacy/request-domain/Open
   Platform configuration and tester access. After the matching server passes
   delivery gates, perform the manual proof journey above on the phone without
   a debug connection. Record the actual new version and redacted result.
   Submit review materials only after real functionality works, without filming
   a visible code. Publish after approval and verify Scheme configuration.
5. Record the exact version and published evidence in P148
   `wechat-publication.json`. Do not enable public mobile login yet.

No step uploads LobeHub web source. The uploaded code is exactly this
`apps/wechat-login-bridge` directory.
