import { json } from './_shared.js';

export const onRequestGet = async ({ env }) => {
  const imagePublicBaseUrl = (env.IMAGE_BED_PUBLIC_BASE_URL || 'https://image.0ha.top').replace(/\/+$/, '');
  return json({
    imagePublicBaseUrl
  });
};
