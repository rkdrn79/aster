# LoRA rank ablation: judging rubric

Each output is a review followed by the predicted sentiment and, in parentheses, the gold label.

- Rate each: **good** when the predicted label matches gold, **bad** when it does not
  (tag `wrong-label`; add `missed-mixed` when a mixed review is called one-sided).
- A/B: the side whose label matches gold wins; **tie** when both match or both miss.
