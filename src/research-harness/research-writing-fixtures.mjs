/**
 * Test fixtures for `writing check`, taken from the Aster writing research (2026-11): naive drafts
 * that a fresh Claude Opus 5.5 or Codex agent wrote from code or notes (research/trials), and short
 * excerpts of the published papers they were measured against (research/exemplars). The excerpts
 * keep the papers' citation keys; the drafts are verbatim, method names anonymised as in the trials.
 */

/** Codex, intro from notes for SmoothQuant (trials/codex/intro-smoothquant.tex). */
export const NAIVE_INTRO_CODEX = String.raw`\section{Introduction}
\label{sec:introduction}

Serving large language models (LLMs) requires substantial memory and computational resources, making efficient inference increasingly important as model sizes grow to hundreds of billions of parameters. Quantizing both weights and activations to 8-bit integers (W8A8) offers a practical route to reducing these costs: it halves the storage required for tensors represented in 16-bit precision and enables the use of fast INT8 matrix multiplication kernels. Realizing these benefits, however, requires preserving model accuracy while mapping inference operations efficiently to hardware.

A central obstacle is the presence of systematic activation outliers in large models. In LLMs larger than 6.7 billion parameters, a small number of activation channels can exhibit magnitudes roughly two orders of magnitude greater than those of other channels. These outliers dominate the quantization range, leaving insufficient resolution for smaller values under per-tensor activation quantization and causing severe accuracy degradation. Existing W8A8 approaches either sacrifice accuracy or rely on mixed-precision decomposition to handle outliers separately, introducing overhead that limits the benefits of INT8 execution.

Our approach builds on an asymmetry between weights and activations: weights are comparatively easy to quantize, whereas activation outliers make activations difficult to quantize. Moreover, these outliers consistently occur in the same channels across tokens. This structure suggests that the quantization difficulty can be redistributed between activations and weights through a fixed channel-wise transformation, rather than handled separately during each inference step.

We introduce \textbf{BalanceQuant}, a method that balances the quantization difficulty of weights and activations through a mathematically equivalent rescaling. For a linear layer $Y=XW$, let $D=\operatorname{diag}(s_1,\ldots,s_C)$ contain positive scaling factors for the $C$ input channels. Then
\begin{equation}
    Y = XW = (XD^{-1})(DW).
    \label{eq:balancequant-equivalence}
\end{equation}
Dividing activation channel $j$ by $s_j$ suppresses its outliers, while multiplying the corresponding weight row by $s_j$ preserves the original computation before quantization. We choose
\begin{equation}
    s_j = \frac{\left(\max_t |X_{tj}|\right)^{\alpha}}
                   {\left(\max_k |W_{jk}|\right)^{1-\alpha}},
    \qquad \alpha=0.5,
    \label{eq:balancequant-scaling}
\end{equation}
where the activation maximum is taken over observed tokens and the weight maximum over the corresponding row. The transformation is performed offline, with activation scaling fused into the preceding layer normalization. This reduces activation quantization difficulty while retaining an execution path compatible with INT8 matrix multiplication.

Our evaluation demonstrates W8A8 inference for OPT-175B, BLOOM-176B, GLM-130B, and MT-NLG 530B with negligible accuracy loss. BalanceQuant achieves up to $1.56\times$ speedup and $2\times$ memory reduction, and enables serving the 530-billion-parameter model on a single eight-GPU node. These results show that redistributing quantization difficulty through an equivalent offline transformation can make efficient W8A8 inference practical at the scale of hundreds of billions of parameters.
`

/** Claude, intro from notes for DPO (trials/claude/intro-dpo.tex). */
export const NAIVE_INTRO_CLAUDE = String.raw`\section{Introduction}
\label{sec:intro}

Large language models (LMs) trained without supervision on very large text corpora learn a broad range of knowledge and skills. Because that training data comes from people with many different goals, priorities, and skill levels, the resulting models can behave in ways we do not want. Getting an LM to produce responses that people actually prefer, and avoid ones they do not, requires an extra step that steers the model toward the desired behavior.

The standard way to do this is reinforcement learning from human feedback (RLHF)~\cite{christiano2017deep,ziegler2019fine,stiennon2020learning,ouyang2022training,bai2022training}. RLHF first fits a reward model to a dataset of human preferences over pairs of responses. It then fine-tunes the LM with reinforcement learning, usually proximal policy optimization (PPO)~\cite{schulman2017proximal}, to maximize this learned reward. A KL-divergence penalty keeps the policy close to the original reference model. RLHF works well in practice, but the pipeline is complex, unstable, and expensive. It trains and runs several models at once, samples from the LM during training, and needs a lot of hyperparameter tuning to work reliably.

In this paper we show that this objective can be optimized directly, without reinforcement learning. Our approach relies on a change of variables. The KL-constrained reward maximization problem that RLHF solves has an optimal policy in closed form. Inverting that expression writes the reward as a function of the policy: $r(x,y) = \beta \log \frac{\pi(y \mid x)}{\pi_{\mathrm{ref}}(y \mid x)}$ plus a term that depends only on the prompt $x$. When we substitute this reparameterized reward into the Bradley--Terry preference model~\cite{bradley1952rank}, the prompt-only term cancels. What remains is a likelihood for the human preference data written entirely in terms of the policy. Fitting the policy to preferences then becomes a simple binary cross-entropy loss.

We call the resulting algorithm \emph{PrefOpt}. PrefOpt fits no separate reward model, uses no reinforcement learning, and does not sample from the LM during fine-tuning. The policy network serves as the reward model implicitly. Training is a single supervised stage on preference pairs, which makes it much simpler to implement and cheaper to run than PPO-based RLHF.

We evaluate PrefOpt on three tasks. In controlled sentiment generation, PrefOpt reaches a better trade-off between reward and KL divergence from the reference model than PPO. On TL;DR summarization and single-turn dialogue on the Anthropic Helpful and Harmless (HH) dataset, PrefOpt matches or beats PPO. We judge these comparisons with both GPT-4 and human evaluators.

In summary, our contributions are:
\begin{itemize}
    \item We show that the KL-constrained reward maximization objective of RLHF can be expressed as a function of the policy alone, which reduces preference learning to a binary cross-entropy loss on the policy.
    \item We introduce PrefOpt, an algorithm based on this result that fine-tunes LMs from preferences with no reward model, no reinforcement learning, and no sampling during training.
    \item We demonstrate empirically that PrefOpt achieves a better reward--KL frontier than PPO on sentiment control and matches or exceeds PPO on summarization and dialogue, as judged by GPT-4 and by humans.
\end{itemize}
`

/** Codex, method from code for DPO (trials/codex/method-dpo.tex, first part). */
export const NAIVE_METHOD_CODEX = String.raw`\section{Method}
\label{sec:method}

PrefOpt learns a language-model policy from pairs of preferred and rejected
responses. It compares the policy's relative scores for the two responses
against those of a reference model and applies a binary preference objective
to the resulting margin. The default objective is mathematically equivalent
to Direct Preference Optimization (DPO); we use PrefOpt to denote the
implementation described here.\footnote{Rafailov et al.,
\emph{Direct Preference Optimization: Your Language Model is Secretly a Reward
Model}, 2023, \texttt{arXiv:2305.18290}.}

\subsection{Preference data and sequence scores}
\label{sec:prefopt-scores}

Let $\mathcal{D}=\{(x_i,y_i^+,y_i^-)\}_{i=1}^{N}$ be a preference dataset,
where $x_i$ is a prompt and $y_i^+$ is preferred to $y_i^-$.
Let $\pi_\theta$ denote the trainable policy and $\pi_{\mathrm{ref}}$ a fixed
reference policy. For a tokenized prompt--response sequence
$z=(z_1,\ldots,z_T)$, define the masked score
\begin{equation}
 s_\theta(x,y)
 = \sum_{t=2}^{T} m_t\log\pi_\theta(z_t\mid z_{<t}),
 \qquad m_t=\mathbf{1}\{\text{label}_t\neq -100\}.
 \label{eq:prefopt-score}
\end{equation}
The implementation aligns each next-token label with the preceding position's
logits, applies a log-softmax over the vocabulary, and gathers the labeled
token's log probability. Labels equal to $-100$ make no contribution.
When prompt and padding labels are masked, this score is the response's
conditional log probability. The helper relies on the supplied labels to
specify this mask.

Summation is the default scoring rule. An optional length-normalized score
divides Eq.~\eqref{eq:prefopt-score} by $\sum_{t=2}^{T}m_t$, requiring at least
one unmasked target token. We write $s_{\mathrm{ref}}$ for the reference score
computed using the same convention. With length normalization, these scores
are mean token log probabilities rather than sequence log probabilities.

\subsection{Reference-relative preference objective}
\label{sec:prefopt-objective}

For each preference pair, we form the margin
\begin{equation}
 h_\theta(x,y^+,y^-)
 = \bigl[s_\theta(x,y^+)-s_\theta(x,y^-)\bigr]
 - \bigl[s_{\mathrm{ref}}(x,y^+)-s_{\mathrm{ref}}(x,y^-)\bigr].
 \label{eq:prefopt-margin}
\end{equation}
Under summed response scoring, this is the log ratio of the policy's
preferred-to-rejected likelihood ratio to the corresponding reference ratio.
A positive margin indicates that the policy favors the preferred response
more strongly than the reference does.

Let $\beta>0$ scale the margin and let $\sigma(u)=(1+e^{-u})^{-1}$.
The modeled probability of the observed preference is
$p_\theta=\sigma(\beta h_\theta)$. With label-smoothing parameter
$\varepsilon$, the per-pair loss is
\begin{equation}
 \ell_{\mathrm{PrefOpt}}(\theta;x,y^+,y^-)
 = -(1-\varepsilon)\log\sigma(\beta h_\theta)
   -\varepsilon\log\sigma(-\beta h_\theta).
 \label{eq:prefopt-loss}
\end{equation}
This is binary cross-entropy with soft preference target $1-\varepsilon$.
For the interpretation of noisy but informative preference labels, we take
$0\leq\varepsilon<\tfrac{1}{2}$; the implementation defaults to
$\varepsilon=0$, recovering the standard DPO loss under summed response
scoring. The empirical objective can be written as
\begin{equation}
 \mathcal{L}_{\mathrm{PrefOpt}}(\theta)
 = \frac{1}{N}\sum_{i=1}^{N}
 \ell_{\mathrm{PrefOpt}}(\theta;x_i,y_i^+,y_i^-).
 \label{eq:prefopt-empirical}
\end{equation}
`

/** Claude, method from code for DPO (trials/claude/method-dpo.tex, opening and implementation). */
export const NAIVE_METHOD_CLAUDE = String.raw`\section{Method}
\label{sec:method}

PrefOpt fine-tunes a language model policy $\pi_\theta$ directly on pairwise
preference data, without fitting an explicit reward model or running
reinforcement learning. Our training objective follows Direct Preference
Optimization (DPO)~\citep{rafailov2023direct}; we additionally support its
conservative (label-smoothed) variant~\citep{mitchell2023note} and the
Identity Preference Optimization (IPO) loss~\citep{azar2023general}. We describe
the setting, the objective and its variants, and the implementation details
below.

target margin.

\paragraph{Reference-free training.}
Optionally, the reference log-ratio in \cref{eq:margin} can be set to zero.
This is equivalent to using a reference model that assigns equal probability to
all responses, so $h_\theta$ reduces to the policy log-ratio
$\log \pi_\theta(y_w\mid x) - \log \pi_\theta(y_l\mid x)$.

\subsection{Implementation}
\label{sec:method:impl}

\paragraph{Sequence log-probabilities.}
For a prompt--response pair tokenized as $(t_1,\dots,t_T)$ with label mask
$m_j \in \{0,1\}$ (where $m_j = 0$ for prompt and padding tokens), we compute
\begin{equation}
  \log \pi(y\mid x) = \sum_{j=2}^{T} m_j \log \pi(t_j \mid t_{<j}),
  \label{eq:seq-logp}
\end{equation}
using the standard one-token shift between logits and labels. Only response
tokens contribute. A length-normalized version, which divides by
$\sum_j m_j$, is also available, but the main objective uses the summed
log-probability.
`

/** SmoothQuant introduction, first three paragraphs (Xiao et al., ICML 2023), refs in standard form. */
export const EXEMPLAR_INTRO = String.raw`\section{Introduction}
Large-scale language models (LLMs) show excellent performance on various tasks~\citep{gpt3,opt}. However, serving LLMs is budget and energy-consuming due to their gigantic model size. For example, the GPT-3~\citep{gpt3} model contains 175B parameters, which will consume at least 350GB of memory to store and run in FP16, requiring 8$\times$48GB A6000 GPUs or 5$\times$80GB A100 GPUs just for inference.
Due to the huge computation and communication overhead, the inference latency may also be unacceptable to real-world applications (Figure~\ref{fig:trend}).
\emph{Quantization} is a promising way to reduce the cost of LLMs~\cite{dettmers2022llmint8, zeroquant}. By quantizing the \emph{weights and activations} with low-bit integers, we can reduce GPU memory requirements, in size and bandwidth, and accelerate compute-intensive operations. For instance, INT8 quantization of weights and activations can halve the GPU memory usage and nearly double the throughput of matrix multiplications compared to FP16.

\begin{figure}
    \centering
    \includegraphics[width=0.9\linewidth]{figures/trend.pdf}
    \caption{The model size of large language models is developing at a faster pace than the GPU memory in recent years, leading to a big gap between the supply and demand for memory.}
    \label{fig:trend}
\end{figure}

However, unlike CNN models or smaller transformer models like BERT~\cite{bert}, the \emph{activations} of LLMs are difficult to quantize. When we scale up LLMs beyond 6.7B parameters, systematic outliers with large magnitude will emerge in activations~\cite{dettmers2022llmint8}, leading to large quantization errors and accuracy degradation.
ZeroQuant~\citep{zeroquant} applies dynamic per-token activation quantization and group-wise weight quantization. It can be implemented efficiently and delivers good accuracy for GPT-3-350M and GPT-J-6B. However, it can not maintain the accuracy for the large OPT model with 175 billion parameters.
LLM.int8()~\cite{dettmers2022llmint8} addresses that accuracy issue by further introducing a mixed-precision decomposition (i.e., it keeps outliers in FP16 and uses INT8 for the other activations). However, it is hard to implement the decomposition efficiently on hardware accelerators.
Therefore, deriving an \emph{efficient}, \emph{hardware-friendly}, and preferably \emph{training-free} quantization scheme for LLMs that would use INT8 for all the compute-intensive operations remains an open challenge.

We propose SmoothQuant, an accurate and efficient post-training quantization (PTQ) solution for LLMs.
SmoothQuant relies on a key observation: even if activations are much harder to quantize than weights due to the presence of outliers~\cite{dettmers2022llmint8}, different tokens exhibit similar variations across their channels (Figure~\ref{fig:intuition}).

\begin{figure}
    \centering
    \includegraphics[width=0.88\linewidth]{figures/intuition.pdf}
    \caption{SmoothQuant's intuition: the activation $\mathbf{X}$ is hard to quantize because outliers stretch the quantization range, leaving few effective bits for most values.}
    \label{fig:intuition}
\end{figure}
`

/** LoRA problem statement (Hu et al., ICLR 2022), opening of the method. */
export const EXEMPLAR_METHOD = String.raw`\section{Problem statement}
\label{sec:problem_statement}
While our proposal is agnostic to training objective, we focus on language modeling as our motivating use case.
Below is a brief description of the language modeling problem and, in particular, the maximization of conditional probabilities given a task-specific prompt.

\newcommand{\cZ}{\mathcal{Z}}
Suppose we are given a pre-trained autoregressive language model $P_\Phi(y|x)$ parametrized by $\Phi$.
For instance, $P_\Phi(y|x)$ can be a generic multi-task learner such as GPT~\citep{radford_language_nodate,brown_language_2020} based on the Transformer architecture~\citep{vaswani2017attention}.
Consider adapting this pre-trained model to downstream conditional text generation tasks, such as summarization, machine reading comprehension (MRC), and natural language to SQL (NL2SQL).
Each downstream task is represented by a training dataset of context-target pairs: $\cZ = \{(x_i, y_i)\}_{i=1,..,N}$, where both $x_i$ and $y_i$ are sequences of tokens.
For example, in NL2SQL, $x_i$ is a natural language query and $y_i$ its corresponding SQL command; for summarization, $x_i$ is the content of an article and $y_i$ its summary.

During full fine-tuning, the model is initialized to pre-trained weights $\Phi_0$ and updated to $\Phi_0+\Delta \Phi$ by repeatedly following the gradient to maximize the conditional language modeling objective:
\begin{align}
    \max_{\Phi} \sum_{(x,y)\in\cZ} \sum_{t=1}^{|y|}  \text{log} \left(  P_{\Phi}(y_{t} | x, y_{<t}) \right)
\label{eq:ft_obj}
\end{align}
One of the main drawbacks for full fine-tuning is that for \emph{each} downstream task, we learn a \emph{different} set of parameters $\Delta\Phi$ whose dimension $|\Delta\Phi|$ equals $|\Phi_0|$. 
Thus, if the pre-trained model is large (such as GPT-3 with $|\Phi_0|\approx175 \text{~Billion}$), storing and deploying many independent instances of fine-tuned models can be challenging, if at all feasible. 

In this paper, we adopt a more parameter-efficient approach, where the task-specific parameter increment $\Delta\Phi = \Delta\Phi(\Theta)$ is further encoded by a much smaller-sized set of parameters $\Theta$ with $|\Theta| \ll |\Phi_0|$.
The task of finding $\Delta\Phi$ thus becomes optimizing over $\Theta$:
\begin{align}
    \max_{\Theta} \sum_{(x,y)\in\cZ}  \sum_{t=1}^{|y|}  \log\left({p_{\Phi_0+\Delta\Phi(\Theta)}(y_{t} | x, y_{<t}})\right)
\label{eq:ft_add}
\end{align}
In the subsequent sections, we propose to use a low-rank representation to encode $\Delta\Phi$ that is both compute- and memory-efficient.
`
