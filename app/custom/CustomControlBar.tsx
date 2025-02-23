// // import React from 'react';
// // import { TrackToggle, DisconnectButton } from '@livekit/components-react';
// // import SettingsMenu from '@/lib/SettingsMenu';
// // import { MaterialSymbol } from 'material-symbols';
// // import '../../styles/CustomControlBar.css'; 


// // const CustomControlBar = ({ roomName, room }) => {
// //   const [recording, setRecording] = React.useState(false);
// //   const [showSettings, setShowSettings] = React.useState(false);

// //   React.useEffect(() => {
// //     if (room) {
// //       room.on('recordedStatusChanged', () => {
// //         setRecording(room.isRecording);
// //       });
// //       return () => {
// //         room.off('recordedStatusChanged');
// //       };
// //     }
// //   }, [room]);

// //   const handleCopyLink = () => {
// //     navigator.clipboard.writeText(window.location.href);
// //   };

// //   return (
// //     <div className="bottom-bar">
// //       <div className="left-section">
// //         <div className="room-name-box">
// //           <span className="room-name">{roomName}</span>
// //           <button className="copy-link-button" onClick={handleCopyLink}>
// //             {/* <MaterialSymbol name="contentCopy" color="#909BAA" /> */}
// //           </button>
// //         </div>
// //       </div>
// //       <div className="center-section">
// //         <TrackToggle trackKind="audio" className="mic-button" />
// //         <TrackToggle trackKind="video" className="camera-button" />
// //         {recording && (
// //           <div className="record-sign">
// //             {/* <MaterialSymbol name="radioButtonChecked" color="#FF6F6F" /> */}
// //           </div>
// //         )}
// //         <TrackToggle trackKind="screen" className="screen-share-button" />
// //         <DisconnectButton className="end-call-button" />
// //       </div>
// //       <div className="right-section">
// //         <button className="settings-button" onClick={() => setShowSettings(true)}>
// //           {/* <MaterialSymbol name="settings" color="#FFFFFF" /> */}
// //         </button>
// //         {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}
// //       </div>
// //     </div>
// //   );
// // };

// // export default CustomControlBar;


// import { TrackToggle, DisconnectButton, RoomAudioRenderer, GridLayout } from '@livekit/components-react';
// import { useState, useEffect } from 'react';

// function CustomControlBar({ room, roomName }) {
//   const [recording, setRecording] = useState(false);

//   // Update recording status
//   useEffect(() => {
//     if (room) {
//       const updateRecordingStatus = () => setRecording(room.isRecording);
//       room.on(RoomEvent.RecordingStarted, updateRecordingStatus);
//       room.on(RoomEvent.RecordingStopped, updateRecordingStatus);
//       return () => {
//         room.off(RoomEvent.RecordingStarted, updateRecordingStatus);
//         room.off(RoomEvent.RecordingStopped, updateRecordingStatus);
//       };
//     }
//   }, [room]);

//   // Copy room link to clipboard
//   const handleCopyLink = () => {
//     navigator.clipboard.writeText(window.location.href)
//       .then(() => alert('Link copied to clipboard!'))
//       .catch((err) => console.error('Failed to copy link:', err));
//   };

//   return (
//     <div className="custom-control-bar">
//       {/* Left: Room Name Box */}
//       <div className="room-name-box">
//         <span className="room-name">{roomName}</span>
//         <button className="copy-link-button" onClick={handleCopyLink}>
//           <span className="material-symbols-outlined">content_copy</span>
//         </button>
//       </div>

//       {/* Center: Control Buttons */}
//       <div className="control-buttons">
//         <TrackToggle source="audio" className="control-button mic-button" />
//         <TrackToggle source="video" className="control-button camera-button" />
//         {recording && (
//           <div className="record-sign">
//             <span className="material-symbols-outlined">radio_button_checked</span>
//           </div>
//         )}
//         <TrackToggle source="screen" className="control-button screen-share-button" />
//         <DisconnectButton className="control-button end-call-button">
//           <span className="material-symbols-outlined">call_end</span>
//         </DisconnectButton>
//       </div>

//       {/* Right: Settings Button */}
//       <div className="settings-section">
//         {SHOW_SETTINGS_MENU && (
//           <button className="settings-button">
//             <span className="material-symbols-outlined">settings</span>
//             <SettingsMenu />
//           </button>
//         )}
//       </div>
//     </div>
//   );
// }