# @bunizao/contracts

Shared TypeScript contracts used by the buxx.me site and API Worker.

The package is published from `packages/contracts` in the
[bunizao/site](https://github.com/bunizao/site) repository. Consumers should
depend on an exact version so the public site and private API Worker upgrade
the contract deliberately together.

```bash
bun add @bunizao/contracts@0.1.0
# or
npm install @bunizao/contracts@0.1.0
```

The package exports the complete contract from `@bunizao/contracts` and the
feature modules from `@bunizao/contracts/{analytics,admin,content,listening,mood,notify,routes,telegram-ops}`.

The package is source-available but not licensed for redistribution. See
[`LICENSE`](LICENSE) for the applicable terms.
