// Deploy-branch guard. A misconfigured Netlify "Production branch" once shipped a
// stale branch to production while every merge to `main` went unseen — the deploy
// read a different branch than we thought. This makes that failure loud instead of
// silent: a *production* build that isn't from `main` aborts before it can publish.
//
// Netlify sets CONTEXT ("production" | "deploy-preview" | "branch-deploy") and
// BRANCH (the head being built) in the build environment. We only assert on a
// production context, so PR previews, branch deploys, local builds and the CI
// `build:web` smoke test (none of which set CONTEXT=production) all pass straight
// through. Override with ALLOW_PRODUCTION_BRANCH if you ever intend to promote a
// different branch on purpose.

const PRODUCTION_BRANCH = 'main';

const context = process.env.CONTEXT;
const branch = process.env.BRANCH;
const override = process.env.ALLOW_PRODUCTION_BRANCH;

if (context === 'production' && branch && branch !== PRODUCTION_BRANCH && !override) {
  console.error(
    `\n✗ Production deploy is building branch "${branch}", not "${PRODUCTION_BRANCH}".\n` +
      `  This is the wrong-deploy-branch misconfiguration. Point Netlify's Production\n` +
      `  branch back to "${PRODUCTION_BRANCH}" (Site settings → Build & deploy → Branches),\n` +
      `  or set ALLOW_PRODUCTION_BRANCH=1 if promoting "${branch}" is intentional.\n`
  );
  process.exit(1);
}

if (context === 'production') {
  console.log(`✓ Production deploy building "${branch ?? PRODUCTION_BRANCH}".`);
}
