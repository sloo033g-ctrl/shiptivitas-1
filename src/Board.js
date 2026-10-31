import React from 'react';
import Dragula from 'dragula';
import 'dragula/dist/dragula.css';
import Swimlane from './Swimlane';
import './Board.css';

const API_URL = 'http://localhost:3001/api/v1/clients';

export default class Board extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      clients: {
        backlog: [],
        inProgress: [],
        complete: [],
      }
    }
    this.swimlanes = {
      backlog: React.createRef(),
      inProgress: React.createRef(),
      complete: React.createRef(),
    }
  }

  componentDidMount() {
    this.drake = Dragula([
      this.swimlanes.backlog.current,
      this.swimlanes.inProgress.current,
      this.swimlanes.complete.current,
    ]);
    this.drake.on('drop', (el) => this.handleDrop(el));
    this.loadClients();
  }

  componentWillUnmount() {
    if (this.drake) {
      this.drake.destroy();
    }
  }

  // Load all clients from the backend and group them into swimlanes,
  // ordered by priority (1 = top of the lane).
  loadClients() {
    return fetch(API_URL)
      .then(response => response.json())
      .then(clients => this.setClientsFromList(clients))
      .catch(error => console.error('Could not load clients', error));
  }

  setClientsFromList(clients) {
    const byPriority = (a, b) => a.priority - b.priority;
    this.setState({
      clients: {
        backlog: clients.filter(c => c.status === 'backlog').sort(byPriority),
        inProgress: clients.filter(c => c.status === 'in-progress').sort(byPriority),
        complete: clients.filter(c => c.status === 'complete').sort(byPriority),
      },
    });
  }

  // Read the card order Dragula produced in the DOM, then revert Dragula's DOM
  // change and let React re-render from state (keeps React as source of truth).
  handleDrop(el) {
    const laneStatus = {
      backlog: 'backlog',
      inProgress: 'in-progress',
      complete: 'complete',
    };
    const order = {};
    Object.keys(laneStatus).forEach(lane => {
      order[lane] = Array.from(this.swimlanes[lane].current.children)
        .map(card => card.getAttribute('data-id'));
    });
    this.drake.cancel(true);

    const byId = {};
    Object.keys(this.state.clients).forEach(lane => {
      this.state.clients[lane].forEach(client => { byId[client.id] = client; });
    });
    const clients = {};
    Object.keys(laneStatus).forEach(lane => {
      clients[lane] = order[lane]
        .filter(id => byId[id])
        .map(id => ({ ...byId[id], status: laneStatus[lane] }));
    });
    this.setState({ clients });

    // Save the move: new status and 1-based position in the lane the card landed in.
    const id = el.getAttribute('data-id');
    const droppedLane = Object.keys(laneStatus).find(lane => order[lane].includes(id));
    const status = laneStatus[droppedLane];
    const priority = order[droppedLane].indexOf(id) + 1;
    fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, priority }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Update failed with status ${response.status}`);
        }
        return response.json();
      })
      // The server returns every client, so resync with what was actually saved.
      .then(clients => this.setClientsFromList(clients))
      .catch(error => {
        console.error('Could not save move, reloading board', error);
        this.loadClients();
      });
  }

  renderSwimlane(name, clients, ref) {
    return (
      <Swimlane name={name} clients={clients} dragulaRef={ref}/>
    );
  }

  render() {
    return (
      <div className="Board">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-4">
              {this.renderSwimlane('Backlog', this.state.clients.backlog, this.swimlanes.backlog)}
            </div>
            <div className="col-md-4">
              {this.renderSwimlane('In Progress', this.state.clients.inProgress, this.swimlanes.inProgress)}
            </div>
            <div className="col-md-4">
              {this.renderSwimlane('Complete', this.state.clients.complete, this.swimlanes.complete)}
            </div>
          </div>
        </div>
      </div>
    );
  }
}