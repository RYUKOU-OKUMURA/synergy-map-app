export type FlowAnimationParams = {
  particleCount: number;
  durationMs: number;
  staggerMs: number;
  particleRadius: number;
  particleColor: string;
  trackOpacity: number;
  fadeEnds: boolean;
};

export const FLOW_BASE_DURATION_MS = 2500;
export const FLOW_STAGGER_MS = 600;
export const FLOW_PARTICLE_RADIUS = 3;
export const FLOW_TRACK_OPACITY = 0.5;
export const FLOW_SELECTED_PARTICLE_SCALE = 1.25;
export const FLOW_SELECTED_OPACITY_BOOST = 1.15;

export function isGlobalFlowAnimationEnabled(options: {
  editable: boolean;
  prefersReducedMotion: boolean;
  userEnabled: boolean;
  captureSuppressed?: boolean;
}) {
  return (
    !options.editable &&
    !options.prefersReducedMotion &&
    options.userEnabled &&
    !options.captureSuppressed
  );
}

const STRENGTH_PARAMS: Record<
  string,
  { particleCount: number; speedFactor: number } | null
> = {
  strong: { particleCount: 3, speedFactor: 1.0 },
  normal: { particleCount: 2, speedFactor: 0.85 },
  bottleneck: { particleCount: 1, speedFactor: 0.5 },
  weak: null,
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  strong: "rgba(22, 138, 131, 0.95)",
  normal: "rgba(22, 138, 131, 0.75)",
  bottleneck: "rgba(217, 119, 6, 0.9)",
};

export function fadeParticleOpacity(progress: number) {
  if (progress < 0.08) return progress / 0.08;
  if (progress > 0.92) return (1 - progress) / 0.08;
  return 1;
}

export function resolveFlowAnimationConfig(
  strength: string,
  edgeType: string,
): FlowAnimationParams | null {
  if (strength === "weak" || edgeType === "data_reference") return null;

  const strengthParams = STRENGTH_PARAMS[strength];
  if (!strengthParams) return null;

  return {
    particleCount: strengthParams.particleCount,
    durationMs: Math.round(FLOW_BASE_DURATION_MS / strengthParams.speedFactor),
    staggerMs: FLOW_STAGGER_MS,
    particleRadius: FLOW_PARTICLE_RADIUS,
    particleColor: EDGE_TYPE_COLORS[edgeType] ?? EDGE_TYPE_COLORS.normal,
    trackOpacity: FLOW_TRACK_OPACITY,
    fadeEnds: true,
  };
}
