package datafeed

import (
	"context"
	"sync"
)

type flightCall[T any] struct {
	done     chan struct{}
	val      T
	err      error
	waiters  int
	finished bool
	fnCancel context.CancelFunc
}

// SingleFlight coalesces concurrent in-flight calls sharing the same key so that
// only one execution of fn runs at a time per key.
type SingleFlight[T any] struct {
	mu    sync.Mutex
	calls map[string]*flightCall[T]
}

// Do executes fn at most once concurrently per key. Concurrent callers with the same key
// wait for the shared result or their own context cancellation. The underlying fn context
// is only cancelled if every waiting caller's context is cancelled.
func (g *SingleFlight[T]) Do(ctx context.Context, key string, fn func(context.Context) (T, error)) (T, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		var zero T
		return zero, err
	}

	g.mu.Lock()
	if g.calls == nil {
		g.calls = make(map[string]*flightCall[T])
	}
	if c, ok := g.calls[key]; ok {
		c.waiters++
		g.mu.Unlock()
		return g.await(ctx, c)
	}

	fnCtx, fnCancel := context.WithCancel(context.WithoutCancel(ctx))
	c := &flightCall[T]{
		done:     make(chan struct{}),
		waiters:  1,
		fnCancel: fnCancel,
	}
	g.calls[key] = c
	g.mu.Unlock()

	go func() {
		defer fnCancel()
		val, err := fn(fnCtx)

		g.mu.Lock()
		c.val = val
		c.err = err
		c.finished = true
		delete(g.calls, key)
		close(c.done)
		g.mu.Unlock()
	}()

	return g.await(ctx, c)
}

func (g *SingleFlight[T]) await(ctx context.Context, c *flightCall[T]) (T, error) {
	select {
	case <-c.done:
		return c.val, c.err
	case <-ctx.Done():
		g.mu.Lock()
		c.waiters--
		if c.waiters == 0 && !c.finished {
			c.fnCancel()
		}
		g.mu.Unlock()
		var zero T
		return zero, ctx.Err()
	}
}
