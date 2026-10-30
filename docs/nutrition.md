# Nutrition calculations

All targets are estimates for this personal adult weight-loss tracker. Calculations are deterministic, use metric units, and are saved with each dated measurement. Targets cannot be edited directly. Age is the age entered for the measurement, rather than an inferred birthday.

## Maintenance calories

The app uses the simplified Mifflin–St Jeor resting energy expenditure equation:

```text
Resting kcal/day = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(years) + sex constant
Sex constant: +5 male, −161 female
Maintenance kcal/day = resting kcal/day × activity factor
```

The original study derived this equation using indirect calorimetry in 498 adults. Its simplified version retained the predictive value of the original equation. Averaging unrelated prediction formulas has no demonstrated advantage for this individual, so the app uses one documented formula. Source: [Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/).

| Activity setting  | Factor |
| ----------------- | -----: |
| Sedentary         |    1.2 |
| Light             |  1.375 |
| Moderate, default |   1.55 |
| Active            |  1.725 |

This ladder is a practical estimation convention, rather than a measurement of exercise expenditure. The default moderate setting represents the described two strength sessions plus one cardio/HIIT session each week. Session frequency alone cannot establish maintenance: work, walking, training intensity, and individual metabolism all matter. A new dated measurement can change the activity setting. Exercise calories are already represented in the multiplier and are not added a second time. The [NIH Body Weight Planner](https://www.niddk.nih.gov/bwp) likewise treats activity as an estimation input, but uses its own physical-activity-level scale; those numbers are not directly substituted into this ladder.

## Mild, steady, and extreme limits

The following are **app definitions**, informed by weight-relative loss research rather than three universally standardized medical categories:

```text
Extreme daily deficit = min(
  current weight × 1% × 7700 / 7,
  maintenance × 30%,
  maintenance − minimum intake
)
Steady daily deficit = extreme daily deficit × 1/2
Mild daily deficit = extreme daily deficit × 1/4
Each intake limit = maintenance − its daily deficit
Minimum intake = 1500 kcal/day male, 1200 kcal/day female
```

Without a cap, the reference rates are 0.25%, 0.5%, and 1% of current weight per week. All three deficits scale down together when a cap applies, preserving distinct limits. The extreme number is a lower-intake reference, while **steady is the daily target**. A small randomized trial comparing slower and faster weight loss in elite athletes found better lean-mass outcomes in the slower group; its findings support avoiding an aggressive default but do not validate an exact individualized rate. Source: [Garthe et al., 2011](https://pubmed.ncbi.nlm.nih.gov/21558571/).

The intake floors are conservative application bounds, not guarantees of adequate nutrition. They align with the lower ends of calorie-restricted eating plans described in the [2013 NHLBI evidence review](https://www.nhlbi.nih.gov/sites/default/files/media/docs/obesity-evidence-review.pdf). If estimated maintenance is at or below the applicable floor plus 4 kcal, the app rejects calculation instead of creating reversed or indistinguishable limits. Calories round to whole kcal; calculated macro targets round to 0.1 g.

Color boundaries match the requested rules exactly:

| Recorded calories                       | Color        |
| --------------------------------------- | ------------ |
| At or below extreme                     | Muted gray   |
| Above extreme through steady, inclusive | Green        |
| Above steady, below mild                | Light orange |
| At or above mild, below maintenance     | Orange       |
| At or above maintenance                 | Red          |

## Protein, fat, and carbohydrates

The selected high-protein, lower-carbohydrate split is **40% protein, 35% fat, and 25% carbohydrate**, applied to the steady calorie target. Grams use 4 kcal/g for protein and carbohydrates and 9 kcal/g for fat.

The split honors the stated dietary preference. It is not established as uniquely optimal for muscle retention, and 40% protein may exceed the protein needed at a given body weight. The ISSN position stand describes 1.4–2.0 g/kg/day as sufficient for most exercising individuals and notes that higher amounts can be useful during energy restriction. A percentage target is an intake guide rather than a hard upper limit. Source: [ISSN protein and exercise position stand, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/).

The app preserves provider/custom calorie values instead of recalculating food calories from macros. Label rounding, fiber, and provider conventions can produce differences. Custom and imported foods are normalized per 100 g; each eaten entry keeps its own nutrient snapshot so future food edits do not rewrite meals.

## Historical dates and seven-day projections

Calendar dates use `YYYY-MM-DD`, with today determined in **Asia/Tashkent**. For a viewed date D, the chart spans D−7 through D and the summary considers only D−7 through D−1. Historical measurements effective on or before each day supply that day's maintenance and limits. The measurement effective on D supplies the current/target weights for the projection.

A day qualifies for the average if its calorie intake is **above its own extreme limit**, or if it was explicitly marked complete. An unmarked day at or below extreme is excluded. A marked complete day counts even with zero intake. Missing days are excluded rather than treated as zero. The number of included days is shown so a short window is visible. Marking a day complete does not change its calorie color.

```text
Daily deficit = that day's maintenance − that day's recorded calories
Average deficit = sum of included daily deficits / included day count
Projected kg/week = average deficit × 7 / 7700
Days to goal = ceil((viewed-date current weight − target weight) × 7700 / average deficit)
Goal date = viewed date + days to goal
```

Positive deficits mean estimated loss; negative deficits mean estimated gain. With no qualifying days the average, rate, and projected date are unavailable. With a zero/negative average deficit there is no projected goal date. If current weight is already at/below target, the target is reached on the viewed date. Date estimates beyond 100 years are omitted.

The `7700 kcal/kg` conversion is a rough static approximation, deliberately matching the requested **same average deficit** assumption. It is not a dynamic physiological model: future maintenance, water weight, body composition, adherence, and metabolic adaptation change actual results. The [NIH Body Weight Planner](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner) uses a more detailed model; the app's projection should be interpreted as a trend estimate that updates with new dated measurements and meals.
