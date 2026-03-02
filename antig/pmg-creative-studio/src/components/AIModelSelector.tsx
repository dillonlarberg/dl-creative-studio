import { RadioGroup } from '@headlessui/react';
import { cn } from '../utils/cn';
import { AI_PROVIDERS } from '../constants/useCases';
import type { AIProvider } from '../types';

interface AIModelSelectorProps {
    selectedId: AIProvider;
    onChange: (id: AIProvider) => void;
    requiredCapability?: string;
}

export default function AIModelSelector({
    selectedId,
    onChange,
    requiredCapability,
}: AIModelSelectorProps) {
    // Filter providers based on the required capability for this use case
    const availableProviders = requiredCapability
        ? AI_PROVIDERS.filter((p) => p.capabilities.includes(requiredCapability))
        : AI_PROVIDERS;

    return (
        <div className="w-full">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-6 text-gray-900">Choose AI Model</label>
                <span className="text-sm text-blue-gray-500" id="model-selector-description">
                    Which intelligence engine should power this task?
                </span>
            </div>

            <RadioGroup value={selectedId} onChange={onChange} className="mt-4 grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-4">
                {availableProviders.map((provider) => (
                    <RadioGroup.Option
                        key={provider.id}
                        value={provider.id}
                        className={({ active, checked }: { active: boolean, checked: boolean }) =>
                            cn(
                                'relative flex cursor-pointer rounded-lg border bg-white p-4 shadow-sm focus:outline-none',
                                active ? 'border-blue-600 ring-2 ring-blue-600' : 'border-gray-300',
                                checked ? 'border-blue-600 ring-2 ring-blue-600' : 'hover:border-blue-400'
                            )
                        }
                    >
                        {({ checked }: { checked: boolean }) => (
                            <>
                                <div className="flex flex-1">
                                    <div className="flex flex-col">
                                        <RadioGroup.Label
                                            as="span"
                                            className={cn('block text-sm font-medium', checked ? 'text-blue-900' : 'text-gray-900')}
                                        >
                                            {provider.name}
                                        </RadioGroup.Label>
                                        <RadioGroup.Description
                                            as="span"
                                            className={cn('mt-1 flex items-center text-sm', checked ? 'text-blue-700' : 'text-gray-500')}
                                        >
                                            {provider.description}
                                        </RadioGroup.Description>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                                        checked ? 'border-transparent bg-blue-600' : 'border-gray-300 bg-white'
                                    )}
                                    aria-hidden="true"
                                >
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                </div>
                            </>
                        )}
                    </RadioGroup.Option>
                ))}
            </RadioGroup>
        </div>
    );
}
