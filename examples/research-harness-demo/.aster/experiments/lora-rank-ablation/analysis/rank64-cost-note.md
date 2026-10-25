# Is rank 64 worth its cost?

- Rank 64 trains 4x the adapter parameters of rank 16.
- Its two seeds differ by 0.0012 val accuracy.
- Its mean gain over rank 16 is 0.0295.

Recommendation: keep rank 16 as the default and report rank 64 as an upper bound with both seeds.
