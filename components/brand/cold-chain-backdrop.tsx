import { cn } from "@/lib/utils";

/**
 * A flat cold-chain scene for the home page background: warehouse, reefer containers,
 * refrigerated truck, a pallet of medicines, a thermometer, a cargo plane on a dashed
 * route and a control tower, with snowflakes. Drawn with the theme tokens (cold blue,
 * navy ink, one Kelvin-red accent), so it follows light and dark themes, and shown at a
 * very low opacity: decoration only, never in the way of the map.
 */

function Snowflake({
  x,
  y,
  r,
  className,
}: {
  x: number;
  y: number;
  r: number;
  className?: string;
}) {
  const arms = [0, 60, 120];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={cn("stroke-cold", className)}
      strokeWidth={r / 4}
      strokeLinecap="round"
      fill="none"
    >
      {arms.map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1={-r} y1={0} x2={r} y2={0} />
          <line x1={r * 0.55} y1={0} x2={r * 0.8} y2={-r * 0.25} />
          <line x1={r * 0.55} y1={0} x2={r * 0.8} y2={r * 0.25} />
          <line x1={-r * 0.55} y1={0} x2={-r * 0.8} y2={-r * 0.25} />
          <line x1={-r * 0.55} y1={0} x2={-r * 0.8} y2={r * 0.25} />
        </g>
      ))}
    </g>
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      className="fill-cold-soft"
    >
      <rect x={0} y={20} width={150} height={34} rx={17} />
      <circle cx={48} cy={24} r={26} />
      <circle cx={92} cy={16} r={30} />
    </g>
  );
}

function Container({ x, y, tone }: { x: number; y: number; tone: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={190} height={52} rx={3} className={tone} />
      {Array.from({ length: 11 }).map((_, i) => (
        <rect
          key={i}
          x={14 + i * 15}
          y={7}
          width={4}
          height={38}
          rx={2}
          className="fill-background opacity-40"
        />
      ))}
      {/* reefer unit */}
      <rect
        x={168}
        y={8}
        width={16}
        height={36}
        rx={2}
        className="fill-foreground opacity-70"
      />
    </g>
  );
}

export function ColdChainBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1600 420"
      preserveAspectRatio="xMaxYMax meet"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* sky */}
      <Cloud x={150} y={60} s={1.1} />
      <Cloud x={760} y={96} s={0.8} />
      <Cloud x={1290} y={40} s={1} />

      {/* the route the shipment flies */}
      <path
        d="M150 330 C 500 120, 1000 40, 1500 150"
        className="stroke-cold"
        strokeWidth={4}
        strokeDasharray="10 14"
        strokeLinecap="round"
        fill="none"
      />

      {/* cargo plane */}
      <g transform="translate(1010 92) rotate(-8)">
        <rect
          x={0}
          y={0}
          width={250}
          height={42}
          rx={21}
          className="fill-foreground"
        />
        <path
          d="M250 6 C 290 10, 300 21, 300 21 C 300 21, 290 34, 250 38 Z"
          className="fill-foreground"
        />
        <path
          d="M18 2 L -8 -46 L 34 -46 L 60 2 Z"
          className="fill-foreground"
        />
        <path
          d="M100 22 L 40 92 L 82 92 L 170 22 Z"
          className="fill-foreground opacity-80"
        />
        <rect
          x={70}
          y={62}
          width={40}
          height={16}
          rx={8}
          className="fill-foreground"
        />
        {Array.from({ length: 7 }).map((_, i) => (
          <circle
            key={i}
            cx={120 + i * 17}
            cy={15}
            r={4}
            className="fill-background opacity-60"
          />
        ))}
        <rect
          x={60}
          y={24}
          width={150}
          height={4}
          rx={2}
          className="fill-brand"
        />
      </g>

      {/* ground and runway */}
      <rect x={0} y={360} width={1600} height={60} className="fill-cold-soft" />
      {Array.from({ length: 16 }).map((_, i) => (
        <rect
          key={i}
          x={20 + i * 100}
          y={386}
          width={56}
          height={6}
          rx={3}
          className="fill-background opacity-70"
        />
      ))}

      {/* cold warehouse */}
      <g transform="translate(60 196)">
        <path
          d="M0 64 L 135 0 L 270 64 Z"
          className="fill-foreground opacity-80"
        />
        <rect x={10} y={64} width={250} height={100} className="fill-cold" />
        <rect
          x={40}
          y={98}
          width={86}
          height={66}
          rx={2}
          className="fill-background opacity-50"
        />
        {Array.from({ length: 6 }).map((_, i) => (
          <rect
            key={i}
            x={40}
            y={104 + i * 10}
            width={86}
            height={3}
            className="fill-cold opacity-60"
          />
        ))}
        <circle cx={196} cy={112} r={30} className="fill-cold-soft" />
      </g>
      {/* snowflake on the warehouse emblem */}
      <Snowflake x={256} y={308} r={20} />

      {/* reefer containers */}
      <Container x={360} y={308} tone="fill-cold" />
      <Container x={372} y={256} tone="fill-foreground opacity-80" />
      <Container x={560} y={308} tone="fill-cold opacity-80" />

      {/* refrigerated truck */}
      <g transform="translate(790 262)">
        <rect
          x={0}
          y={0}
          width={210}
          height={82}
          rx={6}
          className="fill-cold"
        />
        <Snowflake x={105} y={41} r={22} className="stroke-background" />
        <path
          d="M214 22 L 262 22 L 290 52 L 290 82 L 214 82 Z"
          className="fill-brand"
        />
        <rect
          x={226}
          y={30}
          width={36}
          height={22}
          rx={3}
          className="fill-background opacity-70"
        />
        <rect
          x={-8}
          y={84}
          width={306}
          height={8}
          rx={4}
          className="fill-foreground opacity-80"
        />
        {[34, 150, 252].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={98} r={17} className="fill-foreground" />
            <circle
              cx={cx}
              cy={98}
              r={7}
              className="fill-background opacity-70"
            />
          </g>
        ))}
      </g>

      {/* pallet of medicines */}
      <g transform="translate(1124 262)">
        <rect
          x={0}
          y={84}
          width={150}
          height={14}
          rx={2}
          className="fill-foreground opacity-70"
        />
        <rect
          x={6}
          y={30}
          width={66}
          height={54}
          rx={4}
          className="fill-cold"
        />
        <rect
          x={78}
          y={30}
          width={66}
          height={54}
          rx={4}
          className="fill-cold opacity-80"
        />
        <rect
          x={40}
          y={-18}
          width={70}
          height={48}
          rx={4}
          className="fill-cold opacity-90"
        />
        {/* vial */}
        <g transform="translate(67 -8)">
          <rect
            x={0}
            y={8}
            width={16}
            height={26}
            rx={4}
            className="fill-background opacity-80"
          />
          <rect
            x={2}
            y={0}
            width={12}
            height={8}
            rx={2}
            className="fill-brand"
          />
        </g>
        <path
          d="M24 57 h30 M39 42 v30"
          className="stroke-background"
          strokeWidth={6}
          strokeLinecap="round"
        />
      </g>

      {/* thermometer: 2–8 °C */}
      <g transform="translate(1316 214)">
        <rect
          x={0}
          y={0}
          width={30}
          height={124}
          rx={15}
          className="fill-foreground opacity-80"
        />
        <rect
          x={10}
          y={40}
          width={10}
          height={80}
          rx={5}
          className="fill-brand"
        />
        <circle cx={15} cy={128} r={22} className="fill-brand" />
        {[20, 40, 60, 80].map((y) => (
          <rect
            key={y}
            x={34}
            y={y}
            width={16}
            height={4}
            rx={2}
            className="fill-foreground opacity-70"
          />
        ))}
      </g>

      {/* control tower */}
      <g transform="translate(1440 150)">
        <rect
          x={34}
          y={70}
          width={42}
          height={140}
          className="fill-foreground opacity-80"
        />
        <path
          d="M0 70 L 110 70 L 96 30 L 14 30 Z"
          className="fill-foreground"
        />
        <rect
          x={20}
          y={40}
          width={70}
          height={18}
          rx={2}
          className="fill-cold-soft opacity-80"
        />
        <rect x={50} y={8} width={10} height={22} className="fill-foreground" />
        <circle cx={55} cy={6} r={6} className="fill-brand" />
      </g>

      {/* snow in the air */}
      <Snowflake x={620} y={170} r={14} />
      <Snowflake x={930} y={200} r={10} />
      <Snowflake x={1210} y={176} r={12} />
      <Snowflake x={430} y={190} r={9} />
      <Snowflake x={1530} y={290} r={11} />
    </svg>
  );
}
