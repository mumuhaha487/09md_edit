import {
  createHttpError,
  errorResponse,
  getImageUploadConfig,
  json,
  uploadImageToImageBed
} from './_shared.js';

export const onRequestPost = async ({ request, env }) => {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw createHttpError(400, '未找到上传文件');
    }

    if (!String(file.type || '').startsWith('image/')) {
      throw createHttpError(400, '仅支持上传图片文件');
    }

    const uploadConfig = getImageUploadConfig(env);
    const result = await uploadImageToImageBed({
      file,
      ...uploadConfig
    });

    return json({
      url: result.url,
      fileName: result.fileName,
      raw: result.raw
    });
  } catch (error) {
    return errorResponse(error, '图片上传失败');
  }
};
