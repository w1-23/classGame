import { expect, test } from '@playwright/test';

test('success and retry jingles are distinct and move in opposite directions', async ({ page }) => {
  await page.goto('/index.html');
  const selected = await page.evaluate(async () => {
    const { completionSound } = await import('/js/audio.js');
    return {
      passed: completionSound(9, 9),
      failed: completionSound(1, 9)
    };
  });
  expect(selected.passed).toBe('result');
  expect(selected.failed).toBe('retry');

  const contours = await page.evaluate(async () => {
    const context = new AudioContext();

    async function pitchContour(path) {
      const response = await fetch(path);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const samples = buffer.getChannelData(0);
      const windowSize = Math.round(buffer.sampleRate * .045);
      const hop = Math.round(buffer.sampleRate * .08);
      const pitches = [];

      for (let start = 0; start + windowSize < samples.length; start += hop) {
        let energy = 0;
        for (let index = 0; index < windowSize; index += 1) {
          energy += samples[start + index] ** 2;
        }
        if (Math.sqrt(energy / windowSize) < .012) continue;

        let bestLag = 0;
        let bestCorrelation = 0;
        const minLag = Math.floor(buffer.sampleRate / 900);
        const maxLag = Math.floor(buffer.sampleRate / 120);
        for (let lag = minLag; lag <= maxLag; lag += 1) {
          let correlation = 0;
          for (let index = 0; index < windowSize - lag; index += 2) {
            correlation += samples[start + index] * samples[start + index + lag];
          }
          if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
          }
        }
        if (bestLag) pitches.push(Math.round(buffer.sampleRate / bestLag));
      }

      return pitches.slice(0, 12);
    }

    const result = {
      success: await pitchContour('/audio/kenney/result.ogg'),
      retry: await pitchContour('/audio/kenney/retry.ogg')
    };
    await context.close();
    return result;
  });

  expect(contours.success.length).toBeGreaterThan(4);
  expect(contours.retry.length).toBeGreaterThan(4);
  expect(contours.success[0]).toBeLessThan(contours.success.at(-1));
  expect(contours.retry[0]).toBeGreaterThan(contours.retry.at(-1));
  expect(contours.success).not.toEqual(contours.retry);
});
