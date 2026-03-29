import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import { db, storage } from "./firebase";
import { doc, updateDoc } from "firebase/firestore";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from "firebase/storage";

function App() {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [showBackfillButton, setShowBackfillButton] = useState(false);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const tryAutoplay = async () => {
      try {
        audio.volume = 0.5;
        await audio.play();
        setIsPlaying(true);
      } catch (error) {
        setIsPlaying(false);
      }
    };

    tryAutoplay();
  }, []);

  useEffect(() => {
    loadMedia();
  }, []);

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);
  };

 const loadMedia = async () => {
  try {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));

    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log("전체 items:", items);
    console.log(
      "동영상만:",
      items.filter((item) => item.type === "video")
    );

    setMediaItems(items);
  } catch (error) {
    console.error("목록 불러오기 실패:", error);
  }
};

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownload = async () => {
    if (!selectedMedia?.url) return;

    try {
      const response = await fetch(selectedMedia.url);
      const blob = await response.blob();

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = selectedMedia.name || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("다운로드 실패:", error);
      alert("다운로드에 실패했습니다.");
    }
  };

  const backfillVideoThumbnails = async () => {
  try {
    setUploading(true);
    setUploadProgress(0);
    setUploadStatusText("기존 동영상 썸네일 복구 중...");

    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const targets = snapshot.docs.filter((docSnap) => {
      const data = docSnap.data();
      return (
        data.type === "video" &&
        data.url &&
        (!data.thumbnailUrl || data.thumbnailUrl.trim() === "")
      );
    });

    if (targets.length === 0) {
      alert("복구할 동영상이 없습니다.");
      return;
    }

    let doneCount = 0;

    for (const docSnap of targets) {
      const data = docSnap.data();

      try {
        setUploadStatusText(`복구 중: ${data.name || docSnap.id}`);

        const response = await fetch(data.url);
        if (!response.ok) {
          throw new Error(`fetch 실패: ${response.status}`);
        }

        const blob = await response.blob();
        const file = new File(
          [blob],
          data.name || `${docSnap.id}.mp4`,
          { type: blob.type || "video/mp4" }
        );

        const thumbnailBlob = await createVideoThumbnail(file);
        const thumbnailRef = ref(storage, `albums/thumbnails/${docSnap.id}.jpg`);

        await uploadBytes(thumbnailRef, thumbnailBlob);
        const thumbnailUrl = await getDownloadURL(thumbnailRef);

        await updateDoc(doc(db, "albums", docSnap.id), {
          thumbnailUrl,
        });

        doneCount += 1;
        setUploadProgress(Math.round((doneCount / targets.length) * 100));
        console.log("복구 성공:", data.name || docSnap.id, thumbnailUrl);
      } catch (error) {
        console.error("복구 실패:", data.name || docSnap.id, error);
      }
    }

    await loadMedia();
    alert(`썸네일 복구 완료 (${doneCount} / ${targets.length})`);
  } catch (error) {
    console.error("썸네일 복구 전체 실패:", error);
    alert("썸네일 복구 중 오류가 발생했습니다.");
  } finally {
    setUploading(false);
    setTimeout(() => {
      setUploadProgress(0);
      setUploadStatusText("");
    }, 1000);
  }
};

 const createVideoThumbnail = (file) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const url = URL.createObjectURL(file);

    let finished = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const succeed = (blob) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      cleanup();
      resolve(blob);
    };

    const fail = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      cleanup();
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      fail(new Error("썸네일 생성 시간 초과"));
    }, 10000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    video.onloadedmetadata = () => {
      try {
        const targetTime =
          Number.isFinite(video.duration) && video.duration > 1 ? 1 : 0;

        setTimeout(() => {
          try {
            video.currentTime = targetTime;
          } catch (error) {
            fail(error);
          }
        }, 200);
      } catch (error) {
        fail(error);
      }
    };

    video.onseeked = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;

        if (!width || !height) {
          fail(new Error("동영상 썸네일 크기를 가져올 수 없습니다."));
          return;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          fail(new Error("canvas context 생성 실패"));
          return;
        }

        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              fail(new Error("썸네일 생성 실패"));
              return;
            }
            succeed(blob);
          },
          "image/jpeg",
          0.85
        );
      } catch (error) {
        fail(error);
      }
    };

    video.onerror = () => {
      fail(new Error("동영상 로드 실패"));
    };
  });
};

  const getVideoPosterUrl = async (file, fileName) => {
    const thumbnailBlob = await createVideoThumbnail(file);
    const thumbnailRef = ref(storage, `albums/thumbnails/${fileName}.jpg`);
    await uploadBytes(thumbnailRef, thumbnailBlob);
    return await getDownloadURL(thumbnailRef);
  };

  const handleFileChange = async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  try {
    setUploading(true);
    setUploadProgress(0);
    setUploadStatusText(`0 / ${files.length} 업로드 중`);

    let uploadedCount = 0;

    for (const file of files) {
      const fileType = file.type.startsWith("video") ? "video" : "image";
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `albums/${fileName}`);

      await new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const fileProgress =
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

            const totalProgress =
              ((uploadedCount + fileProgress / 100) / files.length) * 100;

            setUploadProgress(Math.round(totalProgress));
            setUploadStatusText(`${uploadedCount} / ${files.length} 업로드 중`);
          },
          (error) => {
            console.error("스토리지 업로드 실패:", file.name, error);
            reject(error);
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

              const docRef = await addDoc(collection(db, "albums"), {
                url: downloadUrl,
                type: fileType,
                createdAt: serverTimestamp(),
                name: file.name,
                thumbnailUrl: "",
              });

              if (fileType === "video") {
                getVideoPosterUrl(file, fileName)
                  .then(async (thumbnailUrl) => {
                    await updateDoc(doc(db, "albums", docRef.id), {
                      thumbnailUrl,
                    });
                    console.log("썸네일 업데이트 완료:", file.name);
                    await loadMedia();
                  })
                  .catch((thumbError) => {
                    console.error("동영상 썸네일 생성 실패:", file.name, thumbError);
                  });
              }

              uploadedCount += 1;
              setUploadProgress(
                Math.round((uploadedCount / files.length) * 100)
              );
              setUploadStatusText(`${uploadedCount} / ${files.length} 업로드 완료`);
              resolve();
            } catch (error) {
              console.error("Firestore 저장 실패:", file.name, error);
              reject(error);
            }
          }
        );
      });
    }

    await loadMedia();
    e.target.value = "";
  } catch (error) {
    console.error("업로드 실패:", error);
    alert("업로드에 실패했습니다.");
  } finally {
    setUploading(false);
    setTimeout(() => {
      setUploadProgress(0);
      setUploadStatusText("");
    }, 1000);
  }
};

  return (
    <div className="App">
      <audio
        ref={audioRef}
        loop
        preload="auto"
        src={`${process.env.PUBLIC_URL}/memorial-music.mp3`}
      />

      <div className="mini-music-player">
        <span className="mini-music-title">봄내음보다 너를</span>

        <div className="mini-music-controls">
          <button className="mini-music-btn" onClick={handlePlay}>
            ▶
          </button>
          <button className="mini-music-btn" onClick={handlePause}>
            ❚❚
          </button>
        </div>
      </div>

      <div className="memorial-container">
        <section className="hero-section">
          <img
            className="hero-image"
            src={`${process.env.PUBLIC_URL}/loveStar.jpg`}
            alt="사랑하는 별이"
          />

          <div className="hero-text">
            <p className="hero-message">구별이 (2013.01.29~2026.03.26)</p>
            <h1 className="hero-title">소중한 별이를 기억하며</h1>
            <p className="hero-message">
              세상에서 가장 이쁜 별이와 함께한 13년. 그동안 고마웠고 사랑해.
            </p>
            <p className="hero-subtext">
              별이와 함께한 따뜻한 순간들을 사진과 영상으로 간직하는 공간입니다.
            </p>
          </div>
        </section>

        <section className="album-section">
   <div className="album-header">
  <h2
    className="album-title"
    onDoubleClick={() => setShowBackfillButton((prev) => !prev)}
  >
    추억 앨범
  </h2>

  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
    <input
      type="file"
      accept="image/*,video/*"
      multiple
      ref={fileInputRef}
      onChange={handleFileChange}
      style={{ display: "none" }}
    />

    <button
      className="upload-button"
      onClick={handleUploadClick}
      disabled={uploading}
    >
      {uploading ? "업로드 중..." : "사진 / 동영상 업로드"}
    </button>

    {showBackfillButton && (
      <button
        className="upload-button"
        onClick={backfillVideoThumbnails}
        disabled={uploading}
      >
        이전 동영상 썸네일 복구
      </button>
    )}
  </div>
</div>

          {uploading && (
            <div className="upload-progress-wrap">
              <div className="upload-progress-text">{uploadStatusText}</div>
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {mediaItems.length === 0 ? (
            <div className="empty-message">아직 업로드된 추억이 없습니다.</div>
          ) : (
           <div className="album-grid">
  {mediaItems.map((item) => (
    <div
      key={item.id}
      className="album-card"
      onClick={() => setSelectedMedia(item)}
    >
      <div className="album-card-inner">
       {item.type === "image" ? (
  <img
    src={item.url}
    alt="추억 미디어"
    className="album-media"
  />
) : (
  <>
    <img
      src={item.thumbnailUrl || `${process.env.PUBLIC_URL}/video-placeholder.jpg`}
      alt="동영상 썸네일"
      className="album-media"
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = `${process.env.PUBLIC_URL}/video-placeholder.jpg`;
      }}
    />
    <div className="video-badge">동영상</div>
  </>
)}
      </div>
    </div>
  ))}
</div>
          )}
        </section>
      </div>

      {selectedMedia && (
        <div
          className="media-modal-overlay"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="media-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-button"
              onClick={() => setSelectedMedia(null)}
            >
              ×
            </button>

            <button className="modal-download-button" onClick={handleDownload}>
              다운로드
            </button>

            {selectedMedia.type === "image" ? (
              <img
                src={selectedMedia.url}
                alt="확대 이미지"
                className="modal-media"
              />
            ) : (
              <video className="modal-media" controls autoPlay playsInline>
                <source src={selectedMedia.url} />
              </video>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;