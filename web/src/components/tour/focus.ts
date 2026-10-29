// The tour may move the keyboard focus, or treat Escape as "skip", only when the user is not busy elsewhere:
// focus on the page itself or already inside the tour card. Typing in a field or working in a dialog wins.
export const focusIsFree = ({ onBody, inCard }: { onBody: boolean; inCard: boolean }) => onBody || inCard;
