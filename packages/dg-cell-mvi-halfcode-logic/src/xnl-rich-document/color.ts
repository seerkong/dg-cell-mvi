const NAMED_COLORS = new Set(`
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow
yellowgreen
`.trim().split(/\s+/));

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTION_COLOR = /^(rgb|rgba|hsl|hsla)\((.*)\)$/i;

export function isXnlRichDocumentColor(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
  if (HEX_COLOR.test(value) || NAMED_COLORS.has(value.toLowerCase())) return true;
  const match = FUNCTION_COLOR.exec(value);
  if (match === null) return false;
  return match[1]!.toLowerCase().startsWith('rgb')
    ? validateRgb(match[2]!)
    : validateHsl(match[2]!);
}

function validateRgb(body: string): boolean {
  const { channels, alpha } = splitChannels(body);
  if (channels.length !== 3) return false;
  const percentMode = channels.every((channel) => channel.endsWith('%'));
  if (!percentMode && channels.some((channel) => channel.endsWith('%'))) return false;
  if (!channels.every((channel) => inRange(channel, 0, percentMode ? 100 : 255))) return false;
  return alpha === undefined || alphaValue(alpha);
}

function validateHsl(body: string): boolean {
  const { channels, alpha } = splitChannels(body);
  return channels.length === 3
    && inRange(channels[0]!, 0, 360)
    && percentInRange(channels[1]!)
    && percentInRange(channels[2]!)
    && (alpha === undefined || alphaValue(alpha));
}

function splitChannels(body: string): { channels: string[]; alpha?: string } {
  const commaSyntax = body.includes(',');
  if (commaSyntax) {
    const parts = body.split(',').map((part) => part.trim());
    if (parts.some((part) => part.length === 0)) return { channels: [] };
    return parts.length === 4
      ? { channels: parts.slice(0, 3), alpha: parts[3] }
      : { channels: parts };
  }
  const slash = body.split('/').map((part) => part.trim());
  if (slash.length > 2) return { channels: [] };
  const channels = slash[0]!.split(/\s+/).filter(Boolean);
  return slash[1] === undefined ? { channels } : { channels, alpha: slash[1] };
}

function inRange(value: string, minimum: number, maximum: number): boolean {
  const token = value.endsWith('%') ? value.slice(0, -1) : value;
  const parsed = Number(token);
  return token.length > 0 && Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;
}

function percentInRange(value: string): boolean {
  return value.endsWith('%') && inRange(value, 0, 100);
}

function alphaValue(value: string): boolean {
  return value.endsWith('%') ? inRange(value, 0, 100) : inRange(value, 0, 1);
}
