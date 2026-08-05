// Minimal type surface for mammoth's browser bundle (no bundled types for this
// subpath). We only use convertToHtml + images.imgElement.
declare module "mammoth/mammoth.browser" {
  interface MammothMessage {
    type: string;
    message: string;
  }
  interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: unknown
  ): Promise<MammothResult>;
  export const images: {
    imgElement(fn: (image: unknown) => { src: string }): unknown;
  };
}
