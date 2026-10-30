# Food data providers

USDA FoodData Central is the sole external food provider. Configure
`USDA_FDC_API_KEY` in Vercel's server environment. The key is read on the server
only and must not use a `NEXT_PUBLIC_` prefix.

## USDA FoodData Central

The adapter uses `/fdc/v1/foods/search` and `/fdc/v1/food/{fdcId}`. Search results
are fetched in pages of 20 and full details are resolved only for a selected
food. Nutrition is
normalized to 100 g using nutrient IDs 1008 (energy), 1003 (protein), 1004 (fat),
and 1005 (carbohydrate). Foundation foods with Atwater energy IDs 2047/2048 are
supported. Kilojoule energy is converted only if kcal energy is absent.

FoodData Central's `foodNutrients` are already per 100 g; `labelNutrients` are per
label serving and are scaled only when a real gram-based serving is available.
Missing macros are not interpreted as zero. Incomplete search records are
omitted; incomplete details explain that another result or a custom food is
needed. Serving sizes use supplied gram weights. Millilitres are never treated as
grams.

USDA's documented default limit is 1,000 requests per hour per IP. A 429 pauses
further requests on the warm instance using `Retry-After`, falling back to one
hour. USDA data is public domain under CC0, and the interface identifies USDA as
the source.

Sources: [API guide](https://fdc.nal.usda.gov/api-guide/),
[data documentation](https://fdc.nal.usda.gov/data-documentation/).

## Ordering and pagination

Every page uses USDA's `sortBy=dataType.keyword&sortOrder=desc`. USDA applies this
ordering before pagination: Survey (FNDDS), SR Legacy, and Foundation foods all
precede Branded foods across the complete result set. The app preserves that
upstream order rather than rearranging an individual page. Live verification
with `chicken breast` returned HTTP 200 for pages 1 and 2, each containing 20
Survey (FNDDS) results and reporting the expected current page.

`searchExternalFoods(query, page)` returns `foods`, `warnings`, and `nextPage`.
Pages start at 1 and must be positive safe integers. The next page is determined
from `totalPages` and `currentPage`, or `totalHits` if page-count metadata is
absent. When all metadata is absent, a full raw page indicates another page.
The raw provider record count is used before excluding foods with incomplete
nutrition, so an unusable page cannot hide usable later results. A failed page
returns a sanitized warning with no next page and is not added to the warm
cache; the API can expose that failure for an explicit retry.

Source: [USDA OpenAPI specification](https://api.nal.usda.gov/fdc/v1/json-spec?api_key=DEMO_KEY).

## Request limits and caching

Search pages cache for seven days and USDA details for 180 days. Each upstream
USDA request opts into Next.js's persistent Data Cache using `cache: force-cache`
and the corresponding `next.revalidate` lifetime, tagged `usda-foods`. On Vercel,
this reuses public USDA responses across requests and server instances instead
of depending on a single warm process. Next.js stores only HTTP 200 responses.

An additional warm-process cache holds at most 1,024 entries, refreshes recency
when an entry is used, and coalesces identical pending requests. Search cache
keys include the page number. Queries are lowercased, trimmed, and have repeated
whitespace collapsed both in cache keys and in the upstream URL, so equivalent
case and spacing variants share both cache layers. Nutrient snapshots for foods
actually logged remain durable in the app database.

Only public upstream USDA data uses these long caches; authenticated app API
responses and personal meal data remain uncached. The shared fetch helper still
defaults to `no-store` unless a caller explicitly opts in. Requests have a
12-second timeout. Search debouncing and local database results further reduce
API calls. Warm-instance rate-limit cooldowns are not a global quota ledger
across Vercel instances.

Source: [Next.js fetch caching and revalidation](https://nextjs.org/docs/app/api-reference/functions/fetch).
