# Education Data Sources

## What Is Now Collected

- China higher education institutions are normalized in `.workspace/data/reference/education/china-higher-education-institutions-2025.json`.
- China undergraduate majors are normalized in `.workspace/data/reference/education/china-undergraduate-majors-2025.json`.
- China vocational education majors are normalized in `.workspace/data/reference/education/china-vocational-majors-2025-12.json`.
- QS World University Rankings 2027 are normalized in `.workspace/data/reference/education/qs-world-university-rankings-2027.json`.
- Source metadata and international QS options are recorded in `.workspace/data/reference/education/sources.json`.

## China Institutions

Use the Ministry of Education `全国高等学校名单` as the canonical school source. The 2025 list is dated 2025-06-20 and contains 3167 higher education institutions: 2919 ordinary institutions and 248 adult higher education institutions. The normalized local file preserves institution code, name, kind, level, province, city, authority, and note.

The earlier third-party CSV mirror in `tmp/school-match/moe-universities.csv` is not sufficient as a canonical source because it has 2631 ordinary institutions, which does not match the 2025 official count.

## China Majors

Use the Ministry of Education `普通高等学校本科专业目录（2025年）` as the canonical undergraduate major source. The normalized local file contains 845 undergraduate majors across 12 discipline categories and 93 major classes.

The current HR code still stores employee major in one `major` column as a JSON string. The UI can keep a two- or three-level picker:

- discipline category: `categoryName`
- major class: `className`
- major: `name`

For the existing GMP/position requirement use case, the current "专业类" selection maps cleanly to `className`.

## Vocational Majors

Use the Ministry of Education `职业教育专业目录（2021年）（更新时间：2025年12月）` as the canonical vocational major source. The normalized local file contains 1491 majors: 368 secondary vocational majors, 802 higher vocational associate majors, and 321 higher vocational bachelor majors.

## International / QS

For international schools, use QS as the ranking/reference layer. The local normalized file keeps a minimal searchable copy of the 2027 public ranking:

- `QS World University Rankings 2027` is the current public ranking page and was published on 2026-06-18.
- The public endpoint currently returns 1504 ranked institutions.
- The page exposes a "Download Excel Table" action, but it routes through TopUniversities sign-up/login.
- QS also offers a `QS World University Rankings Dataset` product for structured benchmarking data.
- `QS World University Rankings by Subject 2026` covers 55 narrow subjects across five broad subject areas and over 1900 institutions.

For production, keep the local QS file as a reference/search aid. Use an authorized downloaded Excel or the QS dataset product for redistribution, historical comparisons, deep indicators, or formal analytics.

## Suggested App Schema

Recommended future tables:

- `EducationInstitution`
  - `id`, `name`, `normalizedName`, `kind`, `level`, `province`, `city`, `country`, `authority`, `source`, `sourceVersion`
- `EducationInstitutionAlias`
  - `institutionId`, `alias`, `aliasType`, `confidence`
- `EducationMajor`
  - `code`, `name`, `categoryCode`, `categoryName`, `classCode`, `className`, `educationLevel`, `sourceVersion`

This lets the employee profile store stable IDs later while still displaying the original text for historical imported values.
