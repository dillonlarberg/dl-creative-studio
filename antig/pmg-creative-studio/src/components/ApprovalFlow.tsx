import { useState } from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { PaperAirplaneIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface ApprovalFlowProps {
    assetIds: string[];
    onApprove: (id: string, notes?: string) => void;
    onReject: (id: string, notes?: string) => void;
    onDownloadAll?: () => void;
}

export default function ApprovalFlow({
    assetIds,
    onApprove,
    onReject,
    onDownloadAll,
}: ApprovalFlowProps) {
    const [status, setStatus] = useState<Record<string, 'pending' | 'approved' | 'rejected'>>(
        assetIds.reduce((acc, id) => ({ ...acc, [id]: 'pending' }), {})
    );
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [isRequestingApproval, setIsRequestingApproval] = useState(false);

    const handleAction = (id: string, action: 'approved' | 'rejected') => {
        setStatus((prev) => ({ ...prev, [id]: action }));
        if (action === 'approved') onApprove(id, notes[id]);
        if (action === 'rejected') onReject(id, notes[id]);
    };

    const allApproved = Object.values(status).every((s) => s === 'approved');

    return (
        <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Creative Approval</h3>
                    <p className="mt-1 text-sm text-blue-gray-500">
                        Review the generated creatives below. Approve assets to finalize and enable download.
                    </p>
                </div>

                {/* Bulk Action / Download */}
                {allApproved && onDownloadAll && (
                    <button
                        onClick={onDownloadAll}
                        className="inline-flex items-center gap-x-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                        <ArrowDownTrayIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />
                        Download All Approved
                    </button>
                )}
            </div>

            <div className="space-y-4">
                {assetIds.map((id, index) => (
                    <div key={id} className="flex flex-col gap-4 rounded-lg bg-gray-50 p-4 sm:flex-row sm:items-center">
                        {/* Thumbnail Placeholder */}
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
                            <span className="text-xs text-gray-400">Asset {index + 1}</span>
                        </div>

                        <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900">Generated Asset — Option {index + 1}</span>
                                {status[id] === 'approved' && (
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                        <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                        Approved
                                    </span>
                                )}
                                {status[id] === 'rejected' && (
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                                        <XCircleIcon className="h-4 w-4 text-red-600" />
                                        Rejected
                                    </span>
                                )}
                            </div>

                            {/* Notes Input */}
                            <input
                                type="text"
                                placeholder="Add feedback or revision notes..."
                                value={notes[id] || ''}
                                onChange={(e) => setNotes({ ...notes, [id]: e.target.value })}
                                disabled={status[id] !== 'pending'}
                                className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 disabled:bg-gray-100 sm:text-sm sm:leading-6"
                            />

                            {/* Actions */}
                            {status[id] === 'pending' && (
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleAction(id, 'approved')}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-green-50 hover:text-green-700 hover:ring-green-600"
                                    >
                                        <CheckCircleIcon className="h-4 w-4" />
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleAction(id, 'rejected')}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-red-50 hover:text-red-700 hover:ring-red-600"
                                    >
                                        <XCircleIcon className="h-4 w-4" />
                                        Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Internal Routing Action (For POC demo flow) */}
            <div className="border-t border-gray-100 pt-6">
                <button
                    onClick={() => setIsRequestingApproval(true)}
                    disabled={isRequestingApproval}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm ring-1 ring-inset ring-blue-600 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                >
                    <PaperAirplaneIcon className="h-4 w-4" />
                    {isRequestingApproval ? 'Approval Requested' : 'Send to Client/Manager for Formal Approval'}
                </button>
            </div>
        </div>
    );
}
