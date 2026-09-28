# AskCore Mini Program Web Workspace

## Review-recovery candidate after the 1.0.5 rejection

The Mini Program now has two explicit entry paths. Direct, search and ordinary
open start at `pages/home/index`, a full-page WebView of the AskCore sign-in and
home experience. A Safari/Chrome WeChat login still uses a server-generated URL
Link that explicitly opens `pages/login/index`; changing the default page does
not redirect that browser journey through the WebView.

Inside the WebView, the AskCore WeChat button starts the same five-minute
Better Auth transaction with the `mini_program_navigation` Adapter. The website
uses the official Mini Program JS bridge to open `pages/login/index`; successful
native confirmation automatically navigates back to the retained WebView,
which consumes the standard Better Auth session. No native user table, second
session type or review-only success path is added.

Production requires both `https://askcore.cn` entries in the platform console:

- request legal domain, for the native `wx.request` confirmation;
- verified business domain, for the full-page `web-view`.

## Historical candidate after the 1.0.1 experience version

The first review opened the mini-program without a website transaction and
received `链接已失效`. A later historical candidate replaced that with
copy-public-website guidance, but 1.0.5 was rejected as pure diversion.
T148-134 supersedes that direct-entry design with the WebView above. Invalid
protected login input still fails closed, and only server `state=authorized`
produces normal-flow success. Rebind success means proof submitted, not a new
browser login or an account merge.

The uploaded **1.0.1 experience version** contained a separate, clearly
labelled prepublication manual-code authorization check. Its genuine phone
result proved only a provider exchange, with no web login, account association
or migration claim. That auxiliary input and its website entry are absent from
this final-function candidate. The candidate is **not** the uploaded 1.0.1;
it requires a fresh version upload after its own checks. No simulated success
or review-only authentication bypass is allowed.

The platform requires a complete, runnable submitted function, not a Demo.
Developer Preview can exercise the functional page and a fresh query before
initial publication, but live capabilities must not be saved in project
configuration, copied into review text, or shown in footage. The parameter
handoff must satisfy P148's secret-custody contract. Complete Safari/Chrome
login requires Release B plus publication/identity gates and a separate real
phone run. The final submitted package must match the eventual operating
package; reviewer access and the external-browser dependency require a
truthful platform decision, not a fabricated standalone login.

Official references: [restricted-access rejection criteria](https://developers.weixin.qq.com/miniprogram/product/reject.html),
[custom-condition device preview](https://developers.weixin.qq.com/miniprogram/dev/devtools/different.html),
and [review screenshots/video](https://developers.weixin.qq.com/doc/oplatform/openApi/OpenApiDoc/miniprogram-management/code-management/submitAudit.html).

This directory is the complete native mini-program uploaded for P148. Its
default page is the AskCore web product surface; the protected native page is
the WeChat login Adapter. It requests no avatar, nickname, phone, location, or
profile scope. The only provider call is
`wx.login`; the only AskCore payload is the one-time WeChat code plus the
server-issued transaction and completion capability.

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
- URL Link page path: `pages/login/index`;
- default direct-entry page: `pages/home/index`;
- business domain: `https://askcore.cn`;
- privacy purpose: login identity confirmation only;
- name search disabled and no public marketing entry;
- website application and mini-program display the same Open Platform owner.

Preview, development upload, and experience versions are useful for controller
testing, but the external Safari/Chrome URL Link targets the published release.
A valid sign-in launch automatically obtains a one-time `wx.login` code and
confirms the transaction; rebind still requires explicit confirmation. The
mini-program cannot be forced back to its original browser tab; after the
success screen, the user returns with iOS/Android system navigation.

## Upload sequence

1. Import this directory in WeChat Developer Tools with the real AppID.
2. Compile normally in the simulator with an empty query. Verify the AskCore
   WebView. Then compile the explicit `pages/login/index` page with only
   `p=invalid` and verify the invalid-link state, using no real credential.
   Do not use phone debugging or put live Scheme values in compile settings.
3. Click **Upload**, enter a version and description, then select the uploaded
   development version in the platform console.
4. Set an ordinary experience version and confirm privacy/request-domain/Open
   Platform configuration and tester access. After the matching server passes
   delivery gates, manually exercise the actual `signin`/`rebind` path on the
   phone without a debug connection. Record the actual new version and
   redacted result. Do not claim the old proof-only 1.0.1 test is full login.
   Discuss review and release order only after the candidate evidence is ready.
5. Record the exact version and published evidence in P148
   `wechat-publication.json`. Do not enable public mobile login yet.

No step uploads LobeHub web source. The uploaded code is exactly this
`apps/wechat-login-bridge` directory.
