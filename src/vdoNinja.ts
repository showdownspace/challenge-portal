const roomName = "showdown_space";
const password = "8fdc0f87560fac56dea937b6839d4de517036443c2a5d5e7";

export function getDirectorUrl() {
  return `https://vdo.ninja/?${new URLSearchParams({
    director: roomName,
    password,
  })}`;
}

export function getGuestUrl(label: string) {
  return `https://vdo.ninja/?${new URLSearchParams({
    room: roomName,
    password,
    broadcast: "",
    muted: "",
    audiodevice: "0",
    screenshare: "",
    label,
    directoronly: "",
    welcome: "Welcome to browser automation challenges, " + label,
  })}`;
}

// console.log(getDirectorUrl());
// console.log(getGuestUrl("team"));
