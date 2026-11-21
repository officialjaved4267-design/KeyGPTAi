export function generateSampleStudioImage(variant: 'product' | 'landscape'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (variant === 'product') {
    // Clean studio backdrop
    const bg = ctx.createLinearGradient(0, 0, 800, 600);
    bg.addColorStop(0, '#1c1830');
    bg.addColorStop(0.6, '#282046');
    bg.addColorStop(1, '#12101d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 800, 600);

    // Studio table surface
    const floor = ctx.createLinearGradient(0, 410, 0, 600);
    floor.addColorStop(0, '#30294d');
    floor.addColorStop(1, '#161324');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 410, 800, 190);

    // Soft studio shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(400, 438, 128, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Minimalist camera lens / studio object in center for clean BG removal & edit tests
    const bodyGrad = ctx.createLinearGradient(290, 170, 510, 420);
    bodyGrad.addColorStop(0, '#e2e8f0');
    bodyGrad.addColorStop(0.45, '#94a3b8');
    bodyGrad.addColorStop(1, '#334155');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(300, 185, 200, 245, 28);
    ctx.fill();

    // Accent collar
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(300, 222, 200, 16);

    // Glass optic center
    const lens = ctx.createRadialGradient(388, 310, 10, 400, 320, 74);
    lens.addColorStop(0, '#c4b5fd');
    lens.addColorStop(0.4, '#4c1d95');
    lens.addColorStop(0.85, '#0f172a');
    lens.addColorStop(1, '#1e293b');
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(400, 320, 72, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(400, 320, 56, 0, Math.PI * 2);
    ctx.stroke();

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(376, 294, 16, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Twilight architectural skyline sample
    const sky = ctx.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, '#0f1024');
    sky.addColorStop(0.55, '#3b1d6a');
    sky.addColorStop(1, '#7c3aed');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 800, 600);

    // Sun / moon orb
    ctx.fillStyle = '#f5d0fe';
    ctx.beginPath();
    ctx.arc(580, 185, 58, 0, Math.PI * 2);
    ctx.fill();

    // Layered mountains
    ctx.fillStyle = '#1e1638';
    ctx.beginPath();
    ctx.moveTo(0, 420);
    ctx.lineTo(180, 265);
    ctx.lineTo(360, 380);
    ctx.lineTo(540, 235);
    ctx.lineTo(800, 390);
    ctx.lineTo(800, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0d0a1a';
    ctx.beginPath();
    ctx.moveTo(0, 470);
    ctx.lineTo(240, 360);
    ctx.lineTo(460, 455);
    ctx.lineTo(680, 330);
    ctx.lineTo(800, 420);
    ctx.lineTo(800, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL('image/png');
}
