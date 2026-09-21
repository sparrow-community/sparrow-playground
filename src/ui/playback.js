/**
 * Visual playback over EVENT records (no engine re-execution).
 */
export function createPlayback({ onFrame, onState }) {
  let frames = [];
  let index = -1;
  let playing = false;
  let intervalMs = 500;
  let timer = null;

  function emit() {
    onState?.({
      index,
      total: frames.length,
      playing,
      intervalMs,
      frame: index >= 0 ? frames[index] : null,
    });
  }

  function show(i) {
    if (!frames.length) {
      index = -1;
      emit();
      onFrame?.(null);
      return;
    }
    index = Math.max(0, Math.min(i, frames.length - 1));
    emit();
    onFrame?.(frames[index], index);
  }

  function stopTimer() {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function pause() {
    playing = false;
    stopTimer();
    emit();
  }

  function play() {
    if (!frames.length) return;
    if (index < 0 || index >= frames.length - 1) {
      index = -1;
    }
    playing = true;
    emit();
    stopTimer();
    timer = setInterval(() => {
      if (index >= frames.length - 1) {
        pause();
        return;
      }
      show(index + 1);
    }, intervalMs);
    // advance immediately so Play feels responsive
    show(index + 1);
  }

  return {
    setFrames(next) {
      const prevId = index >= 0 ? frames[index]?.id : null;
      frames = Array.isArray(next) ? next : [];
      if (!frames.length) {
        pause();
        index = -1;
        emit();
        return;
      }
      if (prevId) {
        const found = frames.findIndex((f) => f.id === prevId);
        index = found >= 0 ? found : Math.min(index, frames.length - 1);
      } else if (index < 0) {
        index = -1;
      } else {
        index = Math.min(index, frames.length - 1);
      }
      emit();
    },
    setIntervalMs(ms) {
      intervalMs = Math.max(50, Number(ms) || 500);
      if (playing) {
        play(); // restart timer with new interval
      } else {
        emit();
      }
    },
    play,
    pause,
    toggle() {
      if (playing) pause();
      else play();
    },
    prev() {
      pause();
      if (!frames.length) return;
      show(index <= 0 ? 0 : index - 1);
    },
    next() {
      pause();
      if (!frames.length) return;
      show(index < 0 ? 0 : Math.min(index + 1, frames.length - 1));
    },
    restart() {
      pause();
      show(0);
    },
    seekToId(id) {
      const found = frames.findIndex((f) => f.id === id);
      if (found < 0) return false;
      pause();
      show(found);
      return true;
    },
    getState() {
      return {
        index,
        total: frames.length,
        playing,
        intervalMs,
        frame: index >= 0 ? frames[index] : null,
      };
    },
  };
}
