import { cn } from '../utils/cn';

type WaveAnimationProps = {
    height?: string;
    waveNumber?: number;
    className?: string;
    width?: string;
};

export default function WaveAnimation({
    height = '120px',
    className,
    waveNumber = 2,
    width = '100%',
}: WaveAnimationProps) {
    const calculateStyle = (index: number) => {
        const isEven = index % 2 === 0;
        return {
            height: isEven ? '100%' : '80%',
            animationDuration: isEven ? '30s' : `${(index + 1) * 12}s`,
            animationDelay: `-${index * 8}s`,
            animationDirection: isEven ? 'normal' : ('reverse' as const),
            opacity: isEven ? 0.08 : 0.05,
        };
    };

    return (
        <div
            className={cn("pointer-events-none relative overflow-hidden", className)}
            style={{ height, width }}
        >
            <div className="absolute inset-x-0 bottom-0 h-full w-full">
                {[...Array(waveNumber)].map((_, i) => (
                    <div
                        key={i}
                        className="wave h-full"
                        style={calculateStyle(i)}
                    />
                ))}
            </div>
        </div>
    );
}
