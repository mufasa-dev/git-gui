export function getEmojiChar(content: string) {
  const map: any = {
    THUMBS_UP: "👍", THUMBS_DOWN: "👎", LAUGH: "😄", 
    HOORAY: "🎉", CONFUSED: "😕", HEART: "❤️", 
    ROCKET: "🚀", EYES: "👀"
  };
  return map[content] || "❤️";
}