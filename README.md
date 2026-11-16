# Markov Chain Sampler

A browser drum machine in which every audio sample is a state of a Markov chain. Walkers move through the chain and trigger a sample each time they enter a state.

## The model

Each sample is a state $i \in \lbrace 1, \dots, n \rbrace$. A walker sitting in state $i$ waits for a holding time $\tau \sim \mathrm{Exp}(\lambda_i)$, then jumps to state $j$ with probability $P_{ij}$ and triggers sample $j$. Self-loops $P_{ii} > 0$ retrigger the same sample. This is the continuous-time Markov chain with generator

$$
Q = \mathrm{diag}(\lambda)\,(P - I).
$$

- **free:** simulates this chain exactly, so its rhythm is a Poisson-like stream with no grid.
- **grid:** lets a walker jump only on ticks of length $\Delta = 60 / (4 \cdot \mathrm{bpm})$, i.e. sixteenth notes. On each tick a walker in state $i$ jumps with probability $p_i = 1 - e^{-\lambda_i \Delta}$. Since $\lceil \mathrm{Exp}(\lambda) / \Delta \rceil \sim \mathrm{Geometric}(1 - e^{-\lambda \Delta})$, this is exactly the CTMC with every jump time rounded up to the next tick: the discrete-time chain
  $$
  K = I - \mathrm{diag}(p)\,(I - P).
  $$

- **rate:** multiplies every holding rate $\lambda_i$, so the chain plays denser or sparser without changing where it goes.

The stationary distribution $\pi$ solves $\pi Q = 0$ with $\sum_i \pi_i = 1$ (in grid mode, $p$ replaces $\lambda$). $\pi_i$ is the long-run fraction of time spent in state $i$, and $\nu_i \propto \pi_i \lambda_i$ is the long-run fraction of hits that land on sample $i$. With more than one closed communicating class, $\pi$ is not unique and the walkers get stuck in whichever class they start in.

Several walkers are independent copies of the chain, each with its own random stream. They are drawn as black dots on the gray graph, numbered when there is more than one.

## Using it

- **Chain:** press `[play]` or the space bar. Click a node to audition its sample, click an edge to jump to its matrix entry, and drag nodes to rearrange the graph. Edge opacity shows $P_{ij}$.
- **Transitions:** drag a cell up or down to change $P_{ij}$ (hold shift for fine steps), or click it to type a value. The rest of the row is rescaled so it always sums to 1. `unif` and `rand` replace a row with a uniform or a random (Dirichlet) distribution.
- **Samples:** the default kit (kick, snare, clap, closed and open hat, tom, cowbell) is synthesized with `OfflineAudioContext` when the page loads, so the project ships with no audio files. Upload your own or drop them anywhere on the page. A new state gets a uniform row, and every other row gives it a share of $1/(n+1)$. Samples in the same choke group cut each other off.
