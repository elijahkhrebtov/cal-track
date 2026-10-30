# Food data providers

USDA FoodData Central is the sole external food provider. Configure
`USDA_FDC_API_KEY` in Vercel's server environment. The key is read on the server
only and must not use a `NEXT_PUBLIC_` prefix.

## USDA FoodData Central

The adapter uses `/fdc/v1/foods/search` and `/fdc/v1/food/{fdcId}`. It requests at
most 15 results and resolves full details only for a selected food. Nutrition is
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

## Request limits and caching

Searches cache for 15 minutes and USDA details for 24 hours. The cache has a
256-entry bound and coalesces identical pending requests. Fetch requests have a 12-second timeout. Search debouncing and local
database-first results in the interface further reduce API calls. These caches
are per warm server instance and are not a global quota ledger across Vercel
instances.
