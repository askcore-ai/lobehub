# AskCore WeChat Login Bridge

This directory is the complete native mini-program uploaded for P148. It is a
private login bridge, not a public product surface. It requests no avatar,
nickname, phone, location, or profile scope. The only provider call is
`wx.login`; the only AskCore payload is the one-time WeChat code plus the
server-issued transaction and completion capability.

## Required platform configuration

Before upload, use a **non-personal-entity** mini-program and bind it to the
same WeChat Open Platform account as AskCore's website application. In WeChat
Developer Tools, import this directory, select the real mini-program AppID, and
keep that local selection in `project.private.config.json`; do not commit a
credential. AppID is not secret, but the AppSecret must exist only in the
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
2. Compile and use Preview to verify both `p=signin` and `p=rebind`.
3. Click **Upload**, enter a version and description, then select the uploaded
   development version in the platform console.
4. Set an experience version, complete privacy/request-domain/Scheme checks,
   submit for review, and publish after approval.
5. Record the exact version and published evidence in P148
   `wechat-publication.json`. Do not enable public mobile login yet.

No step uploads LobeHub web source. The uploaded code is exactly this
`apps/wechat-login-bridge` directory.
