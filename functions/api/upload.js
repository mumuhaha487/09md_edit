import { json, requireEnv } from './_shared.js';

export const onRequestPost = async ({ request, env }) => {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return json({ error: 'No file uploaded' }, { status: 400 });
    }

    const imageBedUploadUrl = requireEnv(env.IMAGE_BED_UPLOAD_URL, 'IMAGE_BED_UPLOAD_URL');
    const imageBedToken = requireEnv(env.IMAGE_BED_TOKEN, 'IMAGE_BED_TOKEN');
    const ext = file.name && file.name.includes('.') ? `.${file.name.split('.').pop()}` : '.png';
    const newFilename = `${Date.now()}_image${ext}`;

    const uploadForm = new FormData();
    uploadForm.append('file', file, newFilename);

    const response = await fetch(imageBedUploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${imageBedToken}`
      },
      body: uploadForm
    });

    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }

    if (!response.ok) {
      return json({ error: 'Upload failed', details: data }, { status: response.status });
    }

    return json(data);
  } catch (error) {
    return json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
};
