# Denoiser samples: judging rubric

Judge each sample's denoised image (label `denoised`, step 300) against the clean scene the
prompt names.

- Rate each: **good** when no grain or pattern is visible at normal size and edges are as sharp
  as the clean scene; **bad** for any visible artifact (checkerboard, banding, color shift) or
  grain that hides the scene; **unsure** when a difference only shows zoomed in.
- A/B: fewer visible artifacts wins, whatever the PSNR in the output text. Otherwise prefer
  less grain, and call it a tie when you cannot tell at normal size.
- Tags: `checkerboard`, `banding`, `grain`, `color-shift`, `blur`.
