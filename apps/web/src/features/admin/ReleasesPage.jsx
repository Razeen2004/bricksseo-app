import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { Upload, PackageOpen, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from '../../components/ui/Skeleton';

export default function AdminReleasesPage() {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [file, setFile] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adminReleases'],
    queryFn: () => apiFetch('/admin/releases')
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData) => {
      // Custom fetch because apiFetch assumes JSON and we need multipart/form-data
      const res = await fetch('/v1/admin/releases', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        // Don't set Content-Type header, browser will set it automatically with the boundary
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to upload release');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminReleases'] });
      setVersion('');
      setChangelog('');
      setFile(null);
      setIsUploading(false);
      setUploadError('');
      toast.success('Release published successfully!');
    },
    onError: (err) => {
      setUploadError(err.message);
      setIsUploading(false);
      toast.error('Upload failed: ' + err.message);
    }
  });

  const handleUpload = (e) => {
    e.preventDefault();
    if (!file || !version) {
      setUploadError('Version and File are required');
      return;
    }
    
    setIsUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('version', version);
    formData.append('changelogMd', changelog);
    formData.append('file', file);

    uploadMutation.mutate(formData);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const releases = data?.releases || [];

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Admin</p>
          <h1 className="mt-1 font-serif text-3xl italic">Releases</h1>
          <p className="mt-1 text-muted">Upload and manage plugin updates</p>
        </div>
      </header>

      {/* Upload Form */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Upload size={18} /> Publish New Release
        </h2>
        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          {uploadError && (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              {uploadError}
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Version Number</label>
              <input
                type="text"
                placeholder="e.g. 1.2.0"
                value={version}
                onChange={e => setVersion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Plugin .zip File</label>
              <input
                type="file"
                accept=".zip"
                onChange={e => setFile(e.target.files[0])}
                className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-1.5 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-1 file:text-sm file:font-semibold file:text-white hover:file:bg-accent-hover focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Changelog (Markdown)</label>
            <textarea
              rows={4}
              placeholder="- Added new feature X..."
              value={changelog}
              onChange={e => setChangelog(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {isUploading ? 'Uploading...' : 'Upload & Publish Release'}
          </button>
        </form>
      </div>

      {/* Previous Releases */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-6 pb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <PackageOpen size={18} /> Release History
          </h2>
        </div>
        
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : releases.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted">No releases published yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-2 font-medium">Version</th>
                <th className="px-6 py-2 font-medium">Date</th>
                <th className="px-6 py-2 font-medium">Size</th>
                <th className="px-6 py-2 font-medium">Hash</th>
                <th className="px-6 py-2 font-medium">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {releases.map(release => (
                <tr key={release.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-semibold text-white">{release.version}</td>
                  <td className="px-6 py-3 text-muted">
                    {new Date(release.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-muted">{formatBytes(release.sizeBytes)}</td>
                  <td className="px-6 py-3 font-mono text-xs text-muted" title={release.sha256}>
                    {release.sha256.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-3 text-muted">
                    <span className="flex items-center gap-1">
                      <Download size={14} /> {release._count.downloads}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
