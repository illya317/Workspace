#!/usr/bin/env bash

next_compiler_cache_command() {
  local phase="$1" repository_root="$2" target="$3" app_root="$4" build_profile="$5"
  local output_root="$6" cache_root="$7" quarantine_root="$8" build_directory="$9" evidence_file="${10}"
  shift 10
  node "$repository_root/ops/release/artifact/next-compiler-cache.mjs" "$phase" \
    --repository-root "$repository_root" \
    --target "$target" \
    --build-profile "$build_profile" \
    --app-root "$app_root" \
    --output-root "$output_root" \
    --cache-root "$cache_root" \
    --quarantine-root "$quarantine_root" \
    --build-directory "$build_directory" \
    --evidence "$evidence_file" \
    "$@"
}

next_compiler_cache_monolith() {
  local phase="$1" repository_root="$2" build_profile="$3"
  local output_root="$repository_root/.cache/release-check/monolith"
  local build_directory="$repository_root/.next"
  mkdir -p "$output_root"
  if [ "$phase" = prepare ]; then rm -rf "$build_directory/cache"; fi
  next_compiler_cache_command "$phase" "$repository_root" monolith . "$build_profile" \
    "$output_root" \
    "$repository_root/.cache/next-targets/monolith" \
    "$repository_root/.cache/quarantine/next-targets" \
    "$build_directory" \
    "$output_root/next-compiler-cache.json"
}

next_compiler_cache_monolith_build() {
  local repository_root="$1" content_digest="$2" external_typecheck="$3"
  local build_profile=monolith-standalone-internal-typecheck
  [ "$external_typecheck" != "1" ] || build_profile=monolith-standalone-external-typecheck
  ensure_build_deps
  next_compiler_cache_monolith prepare "$repository_root" "$build_profile"
  if [ "$external_typecheck" = "1" ]; then
    run_artifact_stage next.build \
      env NEXT_PUBLIC_BUILD_VERSION="$content_digest" BUILD_VERSION="$content_digest" \
      bash -c 'npm run db:generate:inner && npm run build:next:after-typecheck'
  else
    run_artifact_stage next.build \
      env NEXT_PUBLIC_BUILD_VERSION="$content_digest" BUILD_VERSION="$content_digest" \
      npm run build
  fi
  next_compiler_cache_monolith store "$repository_root" "$build_profile"
}

next_compiler_cache_unit() {
  local phase="$1" repository_root="$2" unit_id="$3" app_root="$4" output_root="$5"
  local contract_file="$6" navigation_file="$7" build_directory="$repository_root/$app_root/.next"
  local build_profile=unit-standalone-internal-typecheck
  [ "${DEPLOY_UNIT_SKIP_TYPECHECK:-0}" != "1" ] || build_profile=unit-standalone-external-typecheck
  next_compiler_cache_command "$phase" "$repository_root" "$unit_id" "$app_root" "$build_profile" \
    "$output_root" \
    "$repository_root/.cache/next-units/$unit_id" \
    "$repository_root/.cache/quarantine/next-units" \
    "$build_directory" \
    "$output_root/next-compiler-cache.json" \
    --contract "$contract_file" --navigation "$navigation_file"
}
