import api from './api';
import toast from 'react-hot-toast';

export async function downloadExamPaper(paper: {
  id: string;
  title: string;
  originalFileName?: string | null;
  mimeType?: string | null;
}): Promise<void> {
  try {
    const res = await api.get(`/exam/papers/${paper.id}/download`, {
      params: { json: 'true' },
      responseType: 'blob',
    });

    // Check if the response returned JSON with a presigned cloud downloadUrl
    if (res.data?.type === 'application/json') {
      const text = await (res.data as Blob).text();
      const json = JSON.parse(text);
      if (json.downloadUrl) {
        window.open(json.downloadUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    }

    if (typeof res.data === 'object' && !(res.data instanceof Blob) && (res.data as any).downloadUrl) {
      window.open((res.data as any).downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Otherwise binary blob (local storage driver)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: paper.mimeType || 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = paper.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('download', paper.originalFileName || `${sanitizedTitle}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error('Failed to download exam paper:', err);
    let errorMsg = 'Failed to download exam paper.';
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        if (json.error) errorMsg = json.error;
      } catch {
        // ignore parse error
      }
    } else if (err.response?.data?.error) {
      errorMsg = err.response.data.error;
    }
    toast.error(errorMsg);
  }
}
