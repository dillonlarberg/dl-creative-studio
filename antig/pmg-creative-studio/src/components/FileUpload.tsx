import { useState, useCallback } from 'react';
import { cn } from '../utils/cn';
import { PhotoIcon, ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    accept?: string;
    maxSizeMB?: number;
    label?: string;
    helperText?: string;
}

export default function FileUpload({
    onFileSelect,
    accept = 'image/*',
    maxSizeMB = 10,
    label = 'Upload a file',
    helperText = 'PNG, JPG, GIF up to 10MB',
}: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    }, []);

    const processFile = (file: File) => {
        setError(null);

        // Check size
        if (file.size > maxSizeMB * 1024 * 1024) {
            setError(`File must be smaller than ${maxSizeMB}MB`);
            return;
        }

        // Create preview
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }

        setSelectedFile(file);
        onFileSelect(file);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleChange = function (e: React.ChangeEvent<HTMLInputElement>) {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const clearFile = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    };

    return (
        <div className="w-full">
            <label className="mb-2 block text-sm font-medium text-gray-900">{label}</label>

            {selectedFile ? (
                <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-4">
                        {previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="h-16 w-16 rounded-md object-cover" />
                        ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-blue-50">
                                <PhotoIcon className="h-8 w-8 text-blue-500" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{selectedFile.name}</p>
                            <p className="text-xs text-blue-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <button
                            onClick={clearFile}
                            className="rounded-full p-1 text-blue-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={cn(
                        'flex justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors',
                        isDragging
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                    )}
                >
                    <div className="text-center">
                        <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-blue-gray-300" aria-hidden="true" />
                        <div className="mt-4 flex text-sm leading-6 text-gray-600">
                            <label
                                htmlFor="file-upload"
                                className="relative cursor-pointer rounded-md font-semibold text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 hover:text-blue-500"
                            >
                                <span>Upload a file</span>
                                <input
                                    id="file-upload"
                                    name="file-upload"
                                    type="file"
                                    className="sr-only"
                                    accept={accept}
                                    onChange={handleChange}
                                />
                            </label>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs leading-5 text-gray-500">{helperText}</p>
                    </div>
                </div>
            )}

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
    );
}
