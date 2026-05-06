import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';

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
        <div className="brand-gradient relative min-h-screen bg-[#EEF1F7] font-sans">
            <div className="flex min-h-screen items-center justify-center px-6 py-12">
                <div className="w-full max-w-sm">
                    <div className="mb-6 flex justify-center">
                        <img src="/PMG_Alli_AllBlack_Logo.png" alt="alli" className="h-10 w-auto" />
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-card">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-base font-medium text-gray-900">Sign in</h1>
                            <p className="text-[13px] text-gray-500">Use your Alli credentials to continue.</p>
                        </div>

                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : null}
                            Sign in with Alli
                        </button>

                        {error && (
                            <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3">
                                <p className="text-[13px] text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="mt-6 border-t border-gray-100 pt-4">
                            <p className="text-center text-xs text-gray-400">Secure SSO via OIDC</p>
                        </div>
                    </div>

                    <p className="mt-6 text-center text-xs text-gray-500">
                        Not a PMG employee? Contact IT for access.
                    </p>
                </div>
            </div>
        </div>
    );
}
