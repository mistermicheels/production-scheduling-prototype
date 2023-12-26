Project status:

-   🛑 Not actively maintained
-   🔒 Not looking for code contributions from other developers

# production-scheduling-prototype

This is prototype of a production scheduler for a chocolate factory. It generates random orders, schedules them on specific machines and visualizes the result on a Gantt chart.

## The scheduling problem

This scheduler is designed for the following hypothetical situation:

- The factory produces 3 different colors of chocolate (dark, milk and white)
- Each color is sold either as-is or with nuts added in
- There are two types of machines (type A can only handle chocolate without nuts, type B is slightly faster and can handle nuts as well)
- When switching from non-white to white chocolate or from chocolate with nuts to chocolate without nuts, the machine needs to be thoroughly cleaned in between
- We have a list of orders where each order defines what product to produce, in what quantity, and by when (due date)
- The main goal is to produce everything by its due date (or otherwise minimize the number of days that orders are overdue)
- Further goals, in order of importance, are to minimize the total length of the schedule and to minimize the number of costly switchovers where the machines have to be cleaned between orders

## Related research

This problem can be seen as an instance of the [Unrelated-machines scheduling](https://en.wikipedia.org/wiki/Unrelated-machines_scheduling) problem with machine eligibility
and setup times.

Relevant paper: [Constructive Heuristics for the Unrelated Parallel
Machine Scheduling Problem with Machine Eligibility
and Setup Times (by Paz Perez-Gonzalez, Victor Fernandez-Viagas, Miguel Zamora, Jose M. Framinan)](https://idus.us.es/bitstream/handle/11441/96686/main.pdf?sequence=1)

## Scheduling algorithm

The scheduler uses a two-phase algorithm.

In the first phase an initial schedule is constructed by adding one order at a time, starting with the orders with the least eligible machines and the earliest due date.
Each order is inserted in the best possible place in the current schedule (which may be before another already-scheduled order).

The second phase is an iterative optimization phase.
In every iteration, the algorithm looks for the biggest improvement that can be achieved by moving one order or swapping two orders.
This continues as long as the algorithm finds a way to improve the schedule.
If no further improvement is possible, we have reached a local optimum and the algorithm stops.

The algorithm contains some performance optimizations wich prevent it from doing unnecessary work (like calculating the same exact thing over and over again or exploring changes that won't improve the schedule).

## User interface

When the user interface is loaded, it generates random orders and shows the result of the first phase of the algorithm while the second phase runs in the background.
Once the second phase of the algorithm has completed, the final schedule is shown.

The user can explore the evolution of the schedule over time by using the buttons at the top or the following keyboard shortcuts:

- First: Home
- Previous: Left Arrow
- Pre-optimization: Space
- Next: Right arrow
- Last: End

## Implementation details

All of the data generation, scheduling and visualization logic sits together in one big JavaScript file.

The Gantt chart is implemented using an HTML table.
It doesn't look too spectacular and rendering performance isn't great, but it was a quick and easy way to render a schedule.
