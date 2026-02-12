import { Component, Input, OnInit, OnChanges, OnDestroy, ViewChild, ElementRef, AfterViewInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register Chart.js components
Chart.register(...registerables, ChartDataLabels);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container">
      <canvas #chartCanvas></canvas>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
    }

    .chart-container {
      position: relative;
      width: 100%;
      max-width: 100%;
      height: 400px;
      background: #ffffff;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      box-sizing: border-box;
      overflow: hidden;
    }

    canvas {
      width: 100% !important;
      height: 100% !important;
    }
  `]
})
export class ChartComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  @Input() chartConfig!: any;

  private chart?: Chart;

  ngOnInit(): void {
    // Initialization logic
  }

  ngAfterViewInit(): void {
    if (this.chartConfig) {
      this.renderChart();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update chart when config changes (for streaming updates)
    if (changes['chartConfig'] && !changes['chartConfig'].firstChange) {
      if (this.chart && this.chartConfig) {
        this.updateChart();
      } else if (this.chartCanvas && this.chartConfig) {
        this.renderChart();
      }
    }
  }

  private renderChart(): void {
    if (!this.chartCanvas || !this.chartConfig) {
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    // Destroy existing chart if any
    if (this.chart) {
      this.chart.destroy();
    }

    // Create chart configuration
    const config: ChartConfiguration = {
      type: this.chartConfig.type as ChartType,
      data: this.chartConfig.data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...this.chartConfig.options,
        plugins: {
          ...this.chartConfig.options?.plugins,
          datalabels: {
            display: this.chartConfig.options?.plugins?.datalabels?.display || false,
            align: this.chartConfig.options?.plugins?.datalabels?.align || 'end',
            anchor: this.chartConfig.options?.plugins?.datalabels?.anchor || 'end',
            color: '#374151',
            font: {
              weight: 'bold',
              size: 12
            }
          }
        }
      }
    };

    // Create new chart
    this.chart = new Chart(ctx, config);
  }

  private updateChart(): void {
    if (!this.chart) {
      return;
    }

    // Update chart data
    this.chart.data = this.chartConfig.data;

    // Update chart options if provided
    if (this.chartConfig.options) {
      this.chart.options = {
        ...this.chart.options,
        ...this.chartConfig.options
      };
    }

    // Re-render chart
    this.chart.update();
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }
}
