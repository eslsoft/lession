# Repository Guidelines

## Project Structure & Module Organization
Source lives under `internal/`, following Clean Architecture layers: `core` for domain models, `usecase` for business logic, and `adapter` for I/O (HTTP, DB, streaming). Entry points sit in `cmd/`; the default binary bootstraps from `main.go`. Shared utilities are in `pkg/`, with API contracts, protobuf, and Buf config under `api/`. Use `hack/` for local tooling scripts, and park vendored connectors or external templates inside `third-party/`.

## Build, Test, and Development Commands
`make dep` downloads Go modules. `make lint` runs `golangci-lint` (errcheck disabled to allow async flows). `make test` executes `go test ./...` with coverage and prints the summary. `make build` compiles `main.go` to `build/bin/{{cookiecutter.project_name}}`. Use `make run` to start the service (`go run . serve`). Regenerate protobufs and Ent schema with `make generate` after editing definitions in `api/` or `internal/adapter/db/ent/schema`.

## Coding Style & Naming Conventions
Adhere to standard Go formatting via `gofmt` (tabs, camelCase identifiers). Keep packages lowercase, short, and context-focused (`stream`, `auth`). Place interfaces in the consumer package unless wider reuse is needed. Lint fixes must satisfy `golangci-lint run -D errcheck`; add comments only when logic is non-obvious.

## Testing Guidelines
Place `_test.go` files beside the package under test. Favor table-driven tests and deterministic fixtures. Aim for meaningful coverage on orchestration code; regenerate mocks in `internal/adapter` before asserting behavior. Run `make test` before pushing, and re-run after `make generate` to confirm generated code stays compatible.

## Commit & Pull Request Guidelines
Follow Conventional Commits, as seen with `feat: project init`; prefix scope when it clarifies impact (e.g., `feat(adapter): add s3 storage`). Keep commits focused and include any schema or API artifacts. Pull requests should outline motivation, testing performed, and any follow-up tasks; attach screenshots or sample API payloads when UI/API behavior changes. Link issues with `Closes #ID` when applicable.

## API & Schema Updates
When protobuf or Ent schemas change, run `make generate` and commit the new artifacts. Document breaking API changes in the PR description and coordinate with downstream clients before merging.
