ALTER TABLE "fm360_costs"
  ADD CONSTRAINT "fm360_costs_budget_adjustment_category_check"
  CHECK ("category" IN ('budget', 'adjustment')) NOT VALID;
