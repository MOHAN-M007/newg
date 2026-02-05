const msg = document.getElementById("msg");

document.getElementById("backLobby").onclick = () => {
  window.location.href = "lobby.html";
};

function isValidPass(p) {
  return /^[A-Za-z]{2}\d{4}[!@#$%^&*]{2}$/.test(p);
}

document.getElementById("changePass").onclick = () => {
  const adminKey = document.getElementById("adminKey").value.trim();
  const uid = document.getElementById("targetUid").value.trim().toUpperCase();
  const newPassword = document.getElementById("newPass").value.trim();

  if (!adminKey || !uid || !newPassword) {
    msg.textContent = "All fields required.";
    return;
  }
  if (!isValidPass(newPassword)) {
    msg.textContent = "Invalid password format.";
    return;
  }

  socket.emit("admin:change_password", { adminKey, uid, newPassword }, (res) => {
    if (!res.ok) {
      msg.textContent = `Error: ${res.error}`;
      return;
    }
    msg.textContent = "Password updated.";
  });
};
