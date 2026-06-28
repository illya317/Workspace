import { forwardRef, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";

type PositionedProps = {
  className?: string;
  leftPercent?: number;
  widthPercent?: number;
  leftPx?: number;
  topPx?: number;
  widthPx?: number;
  heightPx?: number;
  backgroundImage?: string;
  title?: string;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
  children?: ReactNode;
};
function positionedStyle({ leftPercent, widthPercent, leftPx, topPx, widthPx, heightPx, backgroundImage }: PositionedProps): CSSProperties {
  return {
    left: leftPercent === undefined ? leftPx : `${leftPercent}%`,
    top: topPx,
    width: widthPercent === undefined ? widthPx : `${widthPercent}%`,
    height: heightPx,
    backgroundImage,
  };
}

function eventProps(props: PositionedProps) {
  return { className: props.className, title: props.title, style: positionedStyle(props), onMouseEnter: props.onMouseEnter, onMouseLeave: props.onMouseLeave };
}

export const WorkPositionedSpan = forwardRef<HTMLSpanElement, PositionedProps>(function WorkPositionedSpan(props, ref) {
  return <span ref={ref} {...eventProps(props)}>{props.children}</span>;
});

export function WorkPositionedDiv(props: PositionedProps) {
  return <div {...eventProps(props)}>{props.children}</div>;
}
