# Testing Guide — Phase 12: CI/CD & Release

> How to verify the automated quality gate: the GitHub Actions pipeline (lint → typecheck → test + coverage → e2e → build → Docker image), the coverage threshold, and the release artifacts (CHANGELOG, published image).
>
> Prior guide: [`TESTING-PHASE-11-OBSERVABILITY.md`](TESTING-PHASE-11-OBSERVABILITY.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. What this phase adds

- **`.github/workflows/ci.yml`** — the pipeline, triggered on push/PR to `main`.
- **`lint:ci` + `typecheck`** scripts (non-mutating, CI-friendly).
- **Coverage gate** — a Jest `coverageThreshold` that fails the build if coverage drops below the floor.
- **Dockerized CI** — the production image is built on every run and pushed to GHCR on `main`.
- **`CHANGELOG.md`** — release history.

---

## 1. Mental model

```
git push / PR ─► GitHub Actions
   ├── job: quality   (Postgres + Redis service containers)
   │     npm ci → prisma generate → lint:ci → typecheck
   │     → test:cov (unit + coverage gate) → migrate deploy → seed → test:e2e → build
   └── job: docker    (needs: quality)
         build multi-stage image  → push to GHCR (only on main)
```

- **One gate, same steps locally and in CI** — every step has an npm script you can run on your machine.
- **Fail fast, fail loud** — any red step blocks the merge.
- **Reproducible image** — the same `Dockerfile` used locally is built (and published) by CI.

---

## 2. Run the whole gate locally

These are the exact commands CI runs, in order:

```bash
npm ci
npx prisma generate
npm run lint:ci        # ESLint, no auto-fix; fails on errors
npm run typecheck      # tsc --noEmit
npm run test:cov       # unit tests + coverage threshold
npx prisma migrate deploy
npm run db:seed
npm run test:e2e       # needs Postgres + Redis (npm run docker:up)
npm run build
```

If all of these pass locally, the `quality` job will pass in CI.

---

## 3. The coverage gate

The threshold lives in `package.json` (`jest.coverageThreshold.global`). Test that it actually gates:

```bash
npm run test:cov
# ends with the coverage table; exits non-zero if any metric is below the floor
```

| Check | Expected |
|---|---|
| Coverage at/above the floor | `test:cov` exits 0 |
| Coverage drops below the floor | `Jest: "global" coverage threshold ... not met` → non-zero exit → CI red |

> The floor is a **regression ratchet** set just below the current baseline. Unit coverage focuses on services/domain logic; controllers, guards and repositories are exercised by the e2e suite instead. Raise the floor as unit coverage grows.

---

## 4. Lint & typecheck (CI variants)

```bash
npm run lint:ci    # like `lint` but WITHOUT --fix — CI must not mutate files
npm run typecheck  # compile-only; catches type errors `nest build` would also catch
```

`lint:ci` exits non-zero on **errors**; warnings don't fail the build.

---

## 5. Watching a CI run

After pushing:

```bash
gh run list --workflow ci.yml            # recent runs + status
gh run watch                             # live-tail the latest run
gh run view --log-failed                 # logs for failed steps
```

Or open the **Actions** tab on GitHub. The README badge reflects the latest `main` run.

| Job | Asserts |
|---|---|
| `quality` | lint, types, unit+coverage, e2e (against real Postgres+Redis), build all pass |
| `docker` | the production image builds; on `main`, it's pushed to GHCR |

---

## 6. The published image (GHCR)

On a successful `main` run the image is published to
`ghcr.io/<owner>/nestjs-enterprise-starter` (tagged `latest` + the commit SHA).

```bash
docker pull ghcr.io/<owner>/nestjs-enterprise-starter:latest
docker run --rm -p 8000:8000 --env-file .env \
  ghcr.io/<owner>/nestjs-enterprise-starter:latest
```

> Packages may be private by default — make the package public in the repo's
> Packages settings, or `docker login ghcr.io` with a PAT to pull.

---

## 7. Release / CHANGELOG

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com) + SemVer.
To cut a release:

1. Move items from **\[Unreleased]** into a new version section with today's date.
2. Tag it: `git tag v0.2.0 && git push --tags`.
3. (Optional) create a GitHub Release from the tag — CI has already published the image for that SHA.

---

## 8. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| CI red at **test:cov** | Coverage dropped below the floor — add tests or check what regressed. |
| CI red at **e2e** but green locally | Usually a missing migrate/seed step, or a test depending on local DB state. CI starts from a clean DB each run. |
| CI red at **lint:ci** | A real lint **error** (warnings don't fail). Run `npm run lint` locally to auto-fix. |
| **docker** job fails to push | GHCR permissions — the job needs `packages: write` (already set); forks' PRs can't push (build-only by design). |
| Image name rejected | The repo name starts with a hyphen (invalid Docker name); CI publishes under the normalised `nestjs-enterprise-starter`. |
