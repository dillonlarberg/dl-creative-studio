import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { SparklesIcon } from '@heroicons/react/24/outline';

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            await authService.loginWithAlli();
            navigate('/select-client');
        } catch (err: any) {
            console.error(err);
            setError('Failed to sign in. Please check your credentials and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="brand-gradient flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                        <SparklesIcon className="h-8 w-8 text-white" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
                    PMG Creative Studio
                </h2>
                <p className="mt-2 text-center text-sm text-blue-gray-500">
                    Sign in with your Alli credentials to start creating.
                </p>
            </div>

            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
                <div className="bg-white/80 backdrop-blur-sm px-6 py-12 shadow-elevated sm:rounded-2xl sm:px-12 border border-white/20">
                    <div className="space-y-6">
                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-3 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                                <SparklesIcon className="h-5 w-5" />
                            )}
                            Sign in with Alli
                        </button>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-10">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-sm font-medium leading-6">
                                <span className="bg-white px-6 text-blue-gray-400">Secure SSO via OIDC</span>
                            </div>
                        </div>
                    </div>
                </div>

                <p className="mt-10 text-center text-sm text-blue-gray-500">
                    Not a PMG employee? Contact IT for access.
                </p>
            </div>
        </div>
    );
}
